const logger = require('./logger');

/**
 * Custom error classes for better error categorization
 */
class ArbitrageError extends Error {
  constructor(message, code = 'ARBITRAGE_ERROR', context = {}) {
    super(message);
    this.name = 'ArbitrageError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

class ExchangeError extends ArbitrageError {
  constructor(message, exchangeId, code = 'EXCHANGE_ERROR', context = {}) {
    super(message, code, { ...context, exchangeId });
    this.name = 'ExchangeError';
    this.exchangeId = exchangeId;
  }
}

class DatabaseError extends ArbitrageError {
  constructor(message, operation, code = 'DATABASE_ERROR', context = {}) {
    super(message, code, { ...context, operation });
    this.name = 'DatabaseError';
    this.operation = operation;
  }
}

class ValidationError extends ArbitrageError {
  constructor(message, field, value, code = 'VALIDATION_ERROR', context = {}) {
    super(message, code, { ...context, field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

class NetworkError extends ArbitrageError {
  constructor(message, url, statusCode, code = 'NETWORK_ERROR', context = {}) {
    super(message, code, { ...context, url, statusCode });
    this.name = 'NetworkError';
    this.url = url;
    this.statusCode = statusCode;
  }
}

/**
 * Circuit breaker implementation for external API calls
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    
    this.onStateChange = options.onStateChange || (() => {});
  }

  async execute(operation, context = {}) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.onStateChange('HALF_OPEN', context);
        logger.info(`Circuit breaker transitioning to HALF_OPEN state for ${context.operation || 'unknown'}`);
      } else {
        throw new ArbitrageError(
          'Circuit breaker is OPEN - operation blocked',
          'CIRCUIT_BREAKER_OPEN',
          context
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess(context);
      return result;
    } catch (error) {
      this.onFailure(error, context);
      throw error;
    }
  }

  onSuccess(context) {
    this.failureCount = 0;
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.onStateChange('CLOSED', context);
      logger.info(`Circuit breaker transitioning to CLOSED state for ${context.operation || 'unknown'}`);
    }
  }

  onFailure(error, context) {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.onStateChange('OPEN', context);
      logger.warn(`Circuit breaker transitioning to OPEN state for ${context.operation || 'unknown'} after ${this.failureCount} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

/**
 * Retry mechanism with exponential backoff
 */
async function withRetry(operation, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2,
    retryCondition = () => true,
    context = {}
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (attempt > 0) {
        logger.info(`Operation succeeded on attempt ${attempt + 1}`, context);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries || !retryCondition(error, attempt)) {
        logger.error(`Operation failed after ${attempt + 1} attempts`, {
          ...context,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
      logger.warn(`Operation failed on attempt ${attempt + 1}, retrying in ${delay}ms`, {
        ...context,
        error: error.message,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Safe async wrapper that catches and logs errors
 */
function safeAsync(operation, context = {}) {
  return async (...args) => {
    try {
      return await operation(...args);
    } catch (error) {
      const enhancedError = enhanceError(error, context);
      logger.error(`Safe async operation failed: ${enhancedError.message}`, {
        ...context,
        error: enhancedError.message,
        stack: enhancedError.stack,
        code: enhancedError.code
      });
      return null;
    }
  };
}

/**
 * Enhance error with additional context and standardize format
 */
function enhanceError(error, context = {}) {
  if (error instanceof ArbitrageError) {
    error.context = { ...error.context, ...context };
    return error;
  }

  // Convert common errors to our custom types
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    return new NetworkError(
      `Network connection failed: ${error.message}`,
      context.url,
      null,
      'NETWORK_CONNECTION_FAILED',
      context
    );
  }

  if (error.message.includes('timeout')) {
    return new NetworkError(
      `Request timeout: ${error.message}`,
      context.url,
      null,
      'NETWORK_TIMEOUT',
      context
    );
  }

  if (error.message.includes('Invalid API key') || error.message.includes('authentication')) {
    return new ExchangeError(
      `Authentication failed: ${error.message}`,
      context.exchangeId,
      'EXCHANGE_AUTH_FAILED',
      context
    );
  }

  // Default enhancement
  return new ArbitrageError(
    error.message,
    'UNKNOWN_ERROR',
    { ...context, originalError: error.name }
  );
}

/**
 * Input validation utilities
 */
const validators = {
  isValidSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      throw new ValidationError('Symbol must be a non-empty string', 'symbol', symbol);
    }
    if (!/^[A-Z]+\/[A-Z]+$/.test(symbol)) {
      throw new ValidationError('Symbol must be in format BASE/QUOTE', 'symbol', symbol);
    }
    return true;
  },

  isValidAmount(amount) {
    if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
      throw new ValidationError('Amount must be a positive finite number', 'amount', amount);
    }
    return true;
  },

  isValidExchangeId(exchangeId) {
    if (!exchangeId || typeof exchangeId !== 'string') {
      throw new ValidationError('Exchange ID must be a non-empty string', 'exchangeId', exchangeId);
    }
    return true;
  },

  isValidPercentage(percentage) {
    if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
      throw new ValidationError('Percentage must be between 0 and 100', 'percentage', percentage);
    }
    return true;
  }
};

/**
 * Error recovery strategies
 */
const recoveryStrategies = {
  async retryWithBackoff(operation, context) {
    return withRetry(operation, {
      maxRetries: 3,
      baseDelay: 1000,
      context
    });
  },

  async fallbackToCache(operation, cacheKey, fallbackValue = null) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Operation failed, using fallback value for ${cacheKey}`, {
        error: error.message
      });
      return fallbackValue;
    }
  },

  async gracefulDegradation(operation, degradedOperation, context) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Primary operation failed, falling back to degraded operation`, {
        ...context,
        error: error.message
      });
      return await degradedOperation();
    }
  }
};

/**
 * Global error handler for uncaught exceptions
 */
function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
      error: error.message,
      stack: error.stack
    });
    
    // Give time for logs to be written
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString()
    });
  });
}

module.exports = {
  // Error classes
  ArbitrageError,
  ExchangeError,
  DatabaseError,
  ValidationError,
  NetworkError,
  
  // Utilities
  CircuitBreaker,
  withRetry,
  safeAsync,
  enhanceError,
  validators,
  recoveryStrategies,
  setupGlobalErrorHandlers
}; 