const ccxt = require('ccxt');
const logger = require('../utils/logger');
const { 
  ExchangeError, 
  NetworkError, 
  ValidationError,
  CircuitBreaker, 
  withRetry, 
  enhanceError,
  validators 
} = require('../utils/errors');

const SUPPORTED_EXCHANGES = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET_KEY,
    options: { defaultType: 'spot' }
  },
  coinbase: {
    apiKey: process.env.COINBASE_API_KEY,
    secret: process.env.COINBASE_SECRET_KEY
  },
  kraken: {
    apiKey: process.env.KRAKEN_API_KEY,
    secret: process.env.KRAKEN_SECRET_KEY
  }
};

const TRADING_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 
  'ADA/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOT/USDT', 'DOGE/USDT', 'AVAX/USDT'
];

// Circuit breakers for each exchange
const exchangeCircuitBreakers = new Map();

// Initialize circuit breakers
function initializeCircuitBreakers() {
  Object.keys(SUPPORTED_EXCHANGES).forEach(exchangeId => {
    exchangeCircuitBreakers.set(exchangeId, new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 30000, // 30 seconds
      onStateChange: (state, context) => {
        logger.warn(`Circuit breaker for ${exchangeId} changed to ${state}`, context);
      }
    }));
  });
}

/**
 * Initialize connections to all configured exchanges
 * @returns {Object} Map of exchange instances
 */
async function initializeExchanges() {
  const exchanges = {};
  
  initializeCircuitBreakers();
  
  for (const [exchangeId, config] of Object.entries(SUPPORTED_EXCHANGES)) {
    try {
      // Validate configuration
      if (!config.apiKey || config.apiKey === 'your_' + exchangeId + '_api_key') {
        logger.warn(`Skipping ${exchangeId} - API keys not configured`);
        continue;
      }

      if (!config.secret || config.secret === 'your_' + exchangeId + '_secret_key') {
        logger.warn(`Skipping ${exchangeId} - Secret key not configured`);
        continue;
      }
      
      const ExchangeClass = ccxt[exchangeId];
      if (!ExchangeClass) {
        throw new ExchangeError(`Exchange ${exchangeId} not supported by CCXT`, exchangeId, 'EXCHANGE_NOT_SUPPORTED');
      }

      const exchange = new ExchangeClass({
        ...config,
        timeout: 30000, // 30 second timeout
        enableRateLimit: true,
        rateLimit: 1000 // 1 second between requests
      });
      
      // Test connection with retry logic
      await withRetry(
        async () => {
          await exchange.loadMarkets();
          
          // Validate that required trading pairs are available
          const availablePairs = Object.keys(exchange.markets);
          const missingPairs = TRADING_PAIRS.filter(pair => !availablePairs.includes(pair));
          
          if (missingPairs.length > 0) {
            logger.warn(`${exchangeId} missing trading pairs: ${missingPairs.join(', ')}`);
          }
          
          return exchange;
        },
        {
          maxRetries: 2,
          baseDelay: 2000,
          context: { operation: 'initializeExchange', exchangeId },
          retryCondition: (error) => {
            // Don't retry on authentication errors
            return !error.message.includes('Invalid API key') && 
                   !error.message.includes('authentication');
          }
        }
      );
      
      logger.info(`Connected to ${exchangeId} - ${Object.keys(exchange.markets).length} markets available`);
      exchanges[exchangeId] = exchange;
      
    } catch (error) {
      const enhancedError = enhanceError(error, { exchangeId, operation: 'initializeExchange' });
      logger.error(`Failed to initialize ${exchangeId}: ${enhancedError.message}`, {
        exchangeId,
        error: enhancedError.message,
        code: enhancedError.code
      });
    }
  }
  
  if (Object.keys(exchanges).length === 0) {
    throw new ExchangeError('No exchanges could be initialized', null, 'NO_EXCHANGES_AVAILABLE');
  }
  
  return exchanges;
}

/**
 * Fetch ticker data for a specific trading pair from an exchange
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @returns {Object} Ticker data
 */
async function fetchTicker(exchange, symbol) {
  try {
    // Input validation
    validators.isValidSymbol(symbol);
    
    if (!exchange || !exchange.id) {
      throw new ExchangeError('Invalid exchange instance', null, 'INVALID_EXCHANGE');
    }

    // Check if market exists
    if (!exchange.markets || !exchange.markets[symbol]) {
      throw new ExchangeError(
        `Trading pair ${symbol} not available on ${exchange.id}`, 
        exchange.id, 
        'MARKET_NOT_AVAILABLE'
      );
    }

    const circuitBreaker = exchangeCircuitBreakers.get(exchange.id);
    if (!circuitBreaker) {
      throw new ExchangeError(`Circuit breaker not found for ${exchange.id}`, exchange.id, 'CIRCUIT_BREAKER_MISSING');
    }

    return await circuitBreaker.execute(
      async () => {
        return await withRetry(
          async () => {
            const ticker = await exchange.fetchTicker(symbol);
            
            // Validate ticker data
            if (!ticker || typeof ticker.bid !== 'number' || typeof ticker.ask !== 'number') {
              throw new ExchangeError(
                `Invalid ticker data received for ${symbol}`, 
                exchange.id, 
                'INVALID_TICKER_DATA'
              );
            }
            
            return ticker;
          },
          {
            maxRetries: 2,
            baseDelay: 1000,
            context: { operation: 'fetchTicker', exchangeId: exchange.id, symbol },
            retryCondition: (error) => {
              // Retry on network errors but not on market-specific errors
              return error.message.includes('timeout') || 
                     error.message.includes('ECONNREFUSED') ||
                     error.message.includes('rate limit');
            }
          }
        );
      },
      { operation: 'fetchTicker', exchangeId: exchange.id, symbol }
    );
    
  } catch (error) {
    const enhancedError = enhanceError(error, { 
      exchangeId: exchange?.id, 
      symbol, 
      operation: 'fetchTicker' 
    });
    
    logger.error(`Failed to fetch ${symbol} ticker from ${exchange?.id}: ${enhancedError.message}`, {
      exchangeId: exchange?.id,
      symbol,
      error: enhancedError.message,
      code: enhancedError.code
    });
    
    return null;
  }
}

/**
 * Fetch order book for a specific trading pair from an exchange
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @param {Number} limit - Number of orders to fetch
 * @returns {Object} Order book data
 */
async function fetchOrderBook(exchange, symbol, limit = 5) {
  try {
    // Input validation
    validators.isValidSymbol(symbol);
    
    if (typeof limit !== 'number' || limit <= 0 || limit > 100) {
      throw new ValidationError('Limit must be a positive number between 1 and 100', 'limit', limit);
    }

    if (!exchange || !exchange.id) {
      throw new ExchangeError('Invalid exchange instance', null, 'INVALID_EXCHANGE');
    }

    // Check if market exists
    if (!exchange.markets || !exchange.markets[symbol]) {
      throw new ExchangeError(
        `Trading pair ${symbol} not available on ${exchange.id}`, 
        exchange.id, 
        'MARKET_NOT_AVAILABLE'
      );
    }

    const circuitBreaker = exchangeCircuitBreakers.get(exchange.id);
    if (!circuitBreaker) {
      throw new ExchangeError(`Circuit breaker not found for ${exchange.id}`, exchange.id, 'CIRCUIT_BREAKER_MISSING');
    }

    return await circuitBreaker.execute(
      async () => {
        return await withRetry(
          async () => {
            const orderBook = await exchange.fetchOrderBook(symbol, limit);
            
            // Validate order book data
            if (!orderBook || !Array.isArray(orderBook.bids) || !Array.isArray(orderBook.asks)) {
              throw new ExchangeError(
                `Invalid order book data received for ${symbol}`, 
                exchange.id, 
                'INVALID_ORDERBOOK_DATA'
              );
            }

            if (orderBook.bids.length === 0 || orderBook.asks.length === 0) {
              throw new ExchangeError(
                `Empty order book for ${symbol}`, 
                exchange.id, 
                'EMPTY_ORDERBOOK'
              );
            }
            
            return orderBook;
          },
          {
            maxRetries: 2,
            baseDelay: 1000,
            context: { operation: 'fetchOrderBook', exchangeId: exchange.id, symbol, limit },
            retryCondition: (error) => {
              return error.message.includes('timeout') || 
                     error.message.includes('ECONNREFUSED') ||
                     error.message.includes('rate limit');
            }
          }
        );
      },
      { operation: 'fetchOrderBook', exchangeId: exchange.id, symbol, limit }
    );
    
  } catch (error) {
    const enhancedError = enhanceError(error, { 
      exchangeId: exchange?.id, 
      symbol, 
      limit,
      operation: 'fetchOrderBook' 
    });
    
    logger.error(`Failed to fetch ${symbol} order book from ${exchange?.id}: ${enhancedError.message}`, {
      exchangeId: exchange?.id,
      symbol,
      limit,
      error: enhancedError.message,
      code: enhancedError.code
    });
    
    return null;
  }
}

/**
 * Execute a market buy order
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @param {Number} amount - Amount to buy
 * @returns {Object} Order result
 */
async function executeBuy(exchange, symbol, amount) {
  try {
    // Input validation
    validators.isValidSymbol(symbol);
    validators.isValidAmount(amount);
    
    if (!exchange || !exchange.id) {
      throw new ExchangeError('Invalid exchange instance', null, 'INVALID_EXCHANGE');
    }

    // Check if trading is enabled
    if (process.env.ENABLE_TRADING !== 'true') {
      logger.info(`[SIMULATION] Buy ${amount} ${symbol} on ${exchange.id}`);
      return { 
        simulated: true, 
        symbol, 
        amount, 
        type: 'buy',
        id: `sim_buy_${Date.now()}`,
        timestamp: new Date().toISOString()
      };
    }

    // Check if market exists and supports trading
    if (!exchange.markets || !exchange.markets[symbol]) {
      throw new ExchangeError(
        `Trading pair ${symbol} not available on ${exchange.id}`, 
        exchange.id, 
        'MARKET_NOT_AVAILABLE'
      );
    }

    const market = exchange.markets[symbol];
    if (!market.active) {
      throw new ExchangeError(
        `Trading pair ${symbol} is not active on ${exchange.id}`, 
        exchange.id, 
        'MARKET_INACTIVE'
      );
    }

    const circuitBreaker = exchangeCircuitBreakers.get(exchange.id);
    if (!circuitBreaker) {
      throw new ExchangeError(`Circuit breaker not found for ${exchange.id}`, exchange.id, 'CIRCUIT_BREAKER_MISSING');
    }

    return await circuitBreaker.execute(
      async () => {
        return await withRetry(
          async () => {
            const order = await exchange.createMarketBuyOrder(symbol, amount);
            
            // Validate order response
            if (!order || !order.id) {
              throw new ExchangeError(
                `Invalid order response for buy order`, 
                exchange.id, 
                'INVALID_ORDER_RESPONSE'
              );
            }
            
            logger.info(`Buy order executed successfully: ${order.id}`, {
              exchangeId: exchange.id,
              symbol,
              amount,
              orderId: order.id
            });
            
            return order;
          },
          {
            maxRetries: 1, // Be more conservative with trading operations
            baseDelay: 2000,
            context: { operation: 'executeBuy', exchangeId: exchange.id, symbol, amount },
            retryCondition: (error) => {
              // Only retry on network timeouts, not on trading errors
              return error.message.includes('timeout') && 
                     !error.message.includes('insufficient') &&
                     !error.message.includes('balance');
            }
          }
        );
      },
      { operation: 'executeBuy', exchangeId: exchange.id, symbol, amount }
    );
    
  } catch (error) {
    const enhancedError = enhanceError(error, { 
      exchangeId: exchange?.id, 
      symbol, 
      amount,
      operation: 'executeBuy' 
    });
    
    logger.error(`Failed to execute buy for ${symbol} on ${exchange?.id}: ${enhancedError.message}`, {
      exchangeId: exchange?.id,
      symbol,
      amount,
      error: enhancedError.message,
      code: enhancedError.code
    });
    
    return null;
  }
}

/**
 * Execute a market sell order
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @param {Number} amount - Amount to sell
 * @returns {Object} Order result
 */
async function executeSell(exchange, symbol, amount) {
  try {
    // Input validation
    validators.isValidSymbol(symbol);
    validators.isValidAmount(amount);
    
    if (!exchange || !exchange.id) {
      throw new ExchangeError('Invalid exchange instance', null, 'INVALID_EXCHANGE');
    }

    // Check if trading is enabled
    if (process.env.ENABLE_TRADING !== 'true') {
      logger.info(`[SIMULATION] Sell ${amount} ${symbol} on ${exchange.id}`);
      return { 
        simulated: true, 
        symbol, 
        amount, 
        type: 'sell',
        id: `sim_sell_${Date.now()}`,
        timestamp: new Date().toISOString()
      };
    }

    // Check if market exists and supports trading
    if (!exchange.markets || !exchange.markets[symbol]) {
      throw new ExchangeError(
        `Trading pair ${symbol} not available on ${exchange.id}`, 
        exchange.id, 
        'MARKET_NOT_AVAILABLE'
      );
    }

    const market = exchange.markets[symbol];
    if (!market.active) {
      throw new ExchangeError(
        `Trading pair ${symbol} is not active on ${exchange.id}`, 
        exchange.id, 
        'MARKET_INACTIVE'
      );
    }

    const circuitBreaker = exchangeCircuitBreakers.get(exchange.id);
    if (!circuitBreaker) {
      throw new ExchangeError(`Circuit breaker not found for ${exchange.id}`, exchange.id, 'CIRCUIT_BREAKER_MISSING');
    }

    return await circuitBreaker.execute(
      async () => {
        return await withRetry(
          async () => {
            const order = await exchange.createMarketSellOrder(symbol, amount);
            
            // Validate order response
            if (!order || !order.id) {
              throw new ExchangeError(
                `Invalid order response for sell order`, 
                exchange.id, 
                'INVALID_ORDER_RESPONSE'
              );
            }
            
            logger.info(`Sell order executed successfully: ${order.id}`, {
              exchangeId: exchange.id,
              symbol,
              amount,
              orderId: order.id
            });
            
            return order;
          },
          {
            maxRetries: 1, // Be more conservative with trading operations
            baseDelay: 2000,
            context: { operation: 'executeSell', exchangeId: exchange.id, symbol, amount },
            retryCondition: (error) => {
              // Only retry on network timeouts, not on trading errors
              return error.message.includes('timeout') && 
                     !error.message.includes('insufficient') &&
                     !error.message.includes('balance');
            }
          }
        );
      },
      { operation: 'executeSell', exchangeId: exchange.id, symbol, amount }
    );
    
  } catch (error) {
    const enhancedError = enhanceError(error, { 
      exchangeId: exchange?.id, 
      symbol, 
      amount,
      operation: 'executeSell' 
    });
    
    logger.error(`Failed to execute sell for ${symbol} on ${exchange?.id}: ${enhancedError.message}`, {
      exchangeId: exchange?.id,
      symbol,
      amount,
      error: enhancedError.message,
      code: enhancedError.code
    });
    
    return null;
  }
}

/**
 * Fetch account balance from an exchange
 * @param {Object} exchange - CCXT exchange instance
 * @returns {Object} Balance data
 */
async function fetchBalance(exchange) {
  try {
    if (!exchange || !exchange.id) {
      throw new ExchangeError('Invalid exchange instance', null, 'INVALID_EXCHANGE');
    }

    const circuitBreaker = exchangeCircuitBreakers.get(exchange.id);
    if (!circuitBreaker) {
      throw new ExchangeError(`Circuit breaker not found for ${exchange.id}`, exchange.id, 'CIRCUIT_BREAKER_MISSING');
    }

    return await circuitBreaker.execute(
      async () => {
        return await withRetry(
          async () => {
            const balance = await exchange.fetchBalance();
            
            // Validate balance data
            if (!balance || typeof balance !== 'object') {
              throw new ExchangeError(
                `Invalid balance data received`, 
                exchange.id, 
                'INVALID_BALANCE_DATA'
              );
            }
            
            return balance;
          },
          {
            maxRetries: 2,
            baseDelay: 1000,
            context: { operation: 'fetchBalance', exchangeId: exchange.id },
            retryCondition: (error) => {
              return error.message.includes('timeout') || 
                     error.message.includes('ECONNREFUSED') ||
                     error.message.includes('rate limit');
            }
          }
        );
      },
      { operation: 'fetchBalance', exchangeId: exchange.id }
    );
    
  } catch (error) {
    const enhancedError = enhanceError(error, { 
      exchangeId: exchange?.id, 
      operation: 'fetchBalance' 
    });
    
    logger.error(`Failed to fetch balance from ${exchange?.id}: ${enhancedError.message}`, {
      exchangeId: exchange?.id,
      error: enhancedError.message,
      code: enhancedError.code
    });
    
    return null;
  }
}

/**
 * Get circuit breaker status for all exchanges
 * @returns {Object} Circuit breaker status map
 */
function getCircuitBreakerStatus() {
  const status = {};
  for (const [exchangeId, circuitBreaker] of exchangeCircuitBreakers.entries()) {
    status[exchangeId] = circuitBreaker.getState();
  }
  return status;
}

module.exports = {
  SUPPORTED_EXCHANGES,
  TRADING_PAIRS,
  initializeExchanges,
  fetchTicker,
  fetchOrderBook,
  executeBuy,
  executeSell,
  fetchBalance,
  getCircuitBreakerStatus
}; 