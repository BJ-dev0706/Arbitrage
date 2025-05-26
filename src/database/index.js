const logger = require('../utils/logger');
const { connectToDatabase } = require('./mongodb');
const { Opportunity, Trade } = require('./models');
const { 
  DatabaseError, 
  ValidationError,
  withRetry, 
  enhanceError,
  validators 
} = require('../utils/errors');

connectToDatabase();

/**
 * Validate opportunity data
 * @param {Object} opportunity - Arbitrage opportunity details
 */
function validateOpportunity(opportunity) {
  if (!opportunity || typeof opportunity !== 'object') {
    throw new ValidationError('Opportunity must be a valid object', 'opportunity', opportunity);
  }

  const requiredFields = ['symbol', 'buyExchange', 'sellExchange', 'buyPrice', 'sellPrice', 'percentageDifference'];
  for (const field of requiredFields) {
    if (opportunity[field] === undefined || opportunity[field] === null) {
      throw new ValidationError(`Missing required field: ${field}`, field, opportunity[field]);
    }
  }

  validators.isValidSymbol(opportunity.symbol);
  validators.isValidExchangeId(opportunity.buyExchange);
  validators.isValidExchangeId(opportunity.sellExchange);

  if (typeof opportunity.buyPrice !== 'number' || opportunity.buyPrice <= 0) {
    throw new ValidationError('Buy price must be a positive number', 'buyPrice', opportunity.buyPrice);
  }

  if (typeof opportunity.sellPrice !== 'number' || opportunity.sellPrice <= 0) {
    throw new ValidationError('Sell price must be a positive number', 'sellPrice', opportunity.sellPrice);
  }

  if (opportunity.buyPrice >= opportunity.sellPrice) {
    throw new ValidationError('Buy price must be less than sell price for arbitrage', 'prices', {
      buyPrice: opportunity.buyPrice,
      sellPrice: opportunity.sellPrice
    });
  }

  if (typeof opportunity.percentageDifference !== 'number' || opportunity.percentageDifference <= 0) {
    throw new ValidationError('Percentage difference must be a positive number', 'percentageDifference', opportunity.percentageDifference);
  }
}

/**
 * Validate trade data
 * @param {Object} trade - Trade details
 */
function validateTrade(trade) {
  if (!trade || typeof trade !== 'object') {
    throw new ValidationError('Trade must be a valid object', 'trade', trade);
  }

  const requiredFields = ['symbol', 'buyExchange', 'sellExchange', 'buyPrice', 'sellPrice'];
  for (const field of requiredFields) {
    if (trade[field] === undefined || trade[field] === null) {
      throw new ValidationError(`Missing required field: ${field}`, field, trade[field]);
    }
  }

  validators.isValidSymbol(trade.symbol);
  validators.isValidExchangeId(trade.buyExchange);
  validators.isValidExchangeId(trade.sellExchange);

  if (typeof trade.buyPrice !== 'number' || trade.buyPrice <= 0) {
    throw new ValidationError('Buy price must be a positive number', 'buyPrice', trade.buyPrice);
  }

  if (typeof trade.sellPrice !== 'number' || trade.sellPrice <= 0) {
    throw new ValidationError('Sell price must be a positive number', 'sellPrice', trade.sellPrice);
  }

  if (trade.baseAmount !== undefined && (typeof trade.baseAmount !== 'number' || trade.baseAmount <= 0)) {
    throw new ValidationError('Base amount must be a positive number', 'baseAmount', trade.baseAmount);
  }

  if (trade.quoteAmount !== undefined && (typeof trade.quoteAmount !== 'number' || trade.quoteAmount <= 0)) {
    throw new ValidationError('Quote amount must be a positive number', 'quoteAmount', trade.quoteAmount);
  }
}

/**
 * Record an arbitrage opportunity
 * @param {Object} opportunity - Arbitrage opportunity details
 * @returns {Promise<Boolean>} Success status
 */
async function recordArbitrageOpportunity(opportunity) {
  try {
    // Validate input
    validateOpportunity(opportunity);

    // Add timestamp if not present
    if (!opportunity.timestamp) {
      opportunity.timestamp = new Date().toISOString();
    }

    // Ensure timestamp is a valid date
    const timestamp = new Date(opportunity.timestamp);
    if (isNaN(timestamp.getTime())) {
      throw new ValidationError('Invalid timestamp format', 'timestamp', opportunity.timestamp);
    }

    return await withRetry(
      async () => {
        const result = await Opportunity.create({
          ...opportunity,
          timestamp: timestamp,
          createdAt: new Date()
        });

        if (!result || !result._id) {
          throw new DatabaseError('Failed to create opportunity record', 'create', 'CREATION_FAILED');
        }

        logger.debug(`Recorded arbitrage opportunity: ${opportunity.symbol} ${opportunity.percentageDifference.toFixed(2)}%`, {
          opportunityId: result._id,
          symbol: opportunity.symbol,
          buyExchange: opportunity.buyExchange,
          sellExchange: opportunity.sellExchange
        });

        return true;
      },
      {
        maxRetries: 2,
        baseDelay: 500,
        context: { operation: 'recordArbitrageOpportunity', symbol: opportunity.symbol },
        retryCondition: (error) => {
          // Retry on connection errors but not on validation errors
          return !error.message.includes('validation') && 
                 !error.message.includes('duplicate') &&
                 (error.message.includes('connection') || error.message.includes('timeout'));
        }
      }
    );

  } catch (error) {
    const enhancedError = enhanceError(error, { 
      operation: 'recordArbitrageOpportunity',
      symbol: opportunity?.symbol,
      buyExchange: opportunity?.buyExchange,
      sellExchange: opportunity?.sellExchange
    });

    logger.error(`Error recording arbitrage opportunity: ${enhancedError.message}`, {
      error: enhancedError.message,
      code: enhancedError.code,
      symbol: opportunity?.symbol,
      stack: enhancedError.stack
    });

    return false;
  }
}

/**
 * Record a completed arbitrage trade
 * @param {Object} trade - Trade details
 * @returns {Promise<Boolean>} Success status
 */
async function recordTrade(trade) {
  try {
    // Validate input
    validateTrade(trade);

    // Add timestamp if not present
    if (!trade.timestamp) {
      trade.timestamp = new Date().toISOString();
    }

    // Ensure timestamp is a valid date
    const timestamp = new Date(trade.timestamp);
    if (isNaN(timestamp.getTime())) {
      throw new ValidationError('Invalid timestamp format', 'timestamp', trade.timestamp);
    }

    // Add completion timestamp if not present
    if (!trade.completedAt) {
      trade.completedAt = new Date().toISOString();
    }

    return await withRetry(
      async () => {
        const result = await Trade.create({
          ...trade,
          timestamp: timestamp,
          completedAt: new Date(trade.completedAt),
          createdAt: new Date()
        });

        if (!result || !result._id) {
          throw new DatabaseError('Failed to create trade record', 'create', 'CREATION_FAILED');
        }

        logger.info(`Recorded arbitrage trade: ${trade.symbol} profit: ${trade.potentialProfit?.toFixed(2) || 'N/A'}`, {
          tradeId: result._id,
          symbol: trade.symbol,
          buyExchange: trade.buyExchange,
          sellExchange: trade.sellExchange,
          profit: trade.potentialProfit
        });

        return true;
      },
      {
        maxRetries: 2,
        baseDelay: 500,
        context: { operation: 'recordTrade', symbol: trade.symbol },
        retryCondition: (error) => {
          return !error.message.includes('validation') && 
                 !error.message.includes('duplicate') &&
                 (error.message.includes('connection') || error.message.includes('timeout'));
        }
      }
    );

  } catch (error) {
    const enhancedError = enhanceError(error, { 
      operation: 'recordTrade',
      symbol: trade?.symbol,
      buyExchange: trade?.buyExchange,
      sellExchange: trade?.sellExchange
    });

    logger.error(`Error recording trade: ${enhancedError.message}`, {
      error: enhancedError.message,
      code: enhancedError.code,
      symbol: trade?.symbol,
      stack: enhancedError.stack
    });

    return false;
  }
}

/**
 * Get recent arbitrage opportunities
 * @param {Number} limit - Maximum number of opportunities to return
 * @returns {Promise<Array>} Recent opportunities
 */
async function getRecentOpportunities(limit = 100) {
  try {
    // Validate limit
    if (typeof limit !== 'number' || limit <= 0 || limit > 1000) {
      throw new ValidationError('Limit must be a positive number between 1 and 1000', 'limit', limit);
    }

    return await withRetry(
      async () => {
        const opportunities = await Opportunity.find({})
          .sort({ timestamp: -1 })
          .limit(limit)
          .lean()
          .exec();

        if (!Array.isArray(opportunities)) {
          throw new DatabaseError('Invalid response from database query', 'find', 'INVALID_RESPONSE');
        }

        logger.debug(`Retrieved ${opportunities.length} recent opportunities`, {
          count: opportunities.length,
          limit
        });

        return opportunities;
      },
      {
        maxRetries: 2,
        baseDelay: 500,
        context: { operation: 'getRecentOpportunities', limit },
        retryCondition: (error) => {
          return error.message.includes('connection') || error.message.includes('timeout');
        }
      }
    );

  } catch (error) {
    const enhancedError = enhanceError(error, { 
      operation: 'getRecentOpportunities',
      limit
    });

    logger.error(`Error getting recent opportunities: ${enhancedError.message}`, {
      error: enhancedError.message,
      code: enhancedError.code,
      limit,
      stack: enhancedError.stack
    });

    return [];
  }
}

/**
 * Get recent trades
 * @param {Number} limit - Maximum number of trades to return
 * @returns {Promise<Array>} Recent trades
 */
async function getRecentTrades(limit = 100) {
  try {
    // Validate limit
    if (typeof limit !== 'number' || limit <= 0 || limit > 1000) {
      throw new ValidationError('Limit must be a positive number between 1 and 1000', 'limit', limit);
    }

    return await withRetry(
      async () => {
        const trades = await Trade.find({})
          .sort({ timestamp: -1 })
          .limit(limit)
          .lean()
          .exec();

        if (!Array.isArray(trades)) {
          throw new DatabaseError('Invalid response from database query', 'find', 'INVALID_RESPONSE');
        }

        logger.debug(`Retrieved ${trades.length} recent trades`, {
          count: trades.length,
          limit
        });

        return trades;
      },
      {
        maxRetries: 2,
        baseDelay: 500,
        context: { operation: 'getRecentTrades', limit },
        retryCondition: (error) => {
          return error.message.includes('connection') || error.message.includes('timeout');
        }
      }
    );

  } catch (error) {
    const enhancedError = enhanceError(error, { 
      operation: 'getRecentTrades',
      limit
    });

    logger.error(`Error getting recent trades: ${enhancedError.message}`, {
      error: enhancedError.message,
      code: enhancedError.code,
      limit,
      stack: enhancedError.stack
    });

    return [];
  }
}

/**
 * Get arbitrage statistics
 * @returns {Promise<Object>} Statistics
 */
async function getArbitrageStats() {
  try {
    return await withRetry(
      async () => {
        // Use Promise.allSettled to handle partial failures gracefully
        const [
          totalOpportunitiesResult,
          totalTradesResult,
          tradesResult,
          opportunitiesResult
        ] = await Promise.allSettled([
          Opportunity.countDocuments().exec(),
          Trade.countDocuments().exec(),
          Trade.find({}).lean().exec(),
          Opportunity.find({}).lean().exec()
        ]);

        // Handle results with fallbacks
        const totalOpportunities = totalOpportunitiesResult.status === 'fulfilled' 
          ? totalOpportunitiesResult.value 
          : 0;

        const totalTrades = totalTradesResult.status === 'fulfilled' 
          ? totalTradesResult.value 
          : 0;

        const trades = tradesResult.status === 'fulfilled' 
          ? tradesResult.value 
          : [];

        const opportunities = opportunitiesResult.status === 'fulfilled' 
          ? opportunitiesResult.value 
          : [];

        // Calculate statistics with error handling
        let totalProfit = 0;
        let avgPercentageDiff = 0;
        const exchangePairs = new Map();

        try {
          totalProfit = trades.reduce((sum, trade) => {
            const profit = typeof trade.potentialProfit === 'number' ? trade.potentialProfit : 0;
            return sum + profit;
          }, 0);
        } catch (error) {
          logger.warn('Error calculating total profit, using 0', { error: error.message });
        }

        try {
          const totalPercentageDiff = opportunities.reduce((sum, opp) => {
            const diff = typeof opp.percentageDifference === 'number' ? opp.percentageDifference : 0;
            return sum + diff;
          }, 0);
          avgPercentageDiff = opportunities.length > 0 ? totalPercentageDiff / opportunities.length : 0;
        } catch (error) {
          logger.warn('Error calculating average percentage difference, using 0', { error: error.message });
        }

        try {
          opportunities.forEach(opp => {
            if (!opp.buyExchange || !opp.sellExchange) return;
            
            const key = `${opp.buyExchange}-${opp.sellExchange}`;
            if (!exchangePairs.has(key)) {
              exchangePairs.set(key, { count: 0, totalProfit: 0 });
            }
            
            const pairStats = exchangePairs.get(key);
            pairStats.count++;
            
            const relatedTrade = trades.find(t => 
              t.buyExchange === opp.buyExchange && 
              t.sellExchange === opp.sellExchange && 
              Math.abs(new Date(t.timestamp).getTime() - new Date(opp.timestamp).getTime()) < 60000 // Within 1 minute
            );
            
            if (relatedTrade && typeof relatedTrade.potentialProfit === 'number') {
              pairStats.totalProfit += relatedTrade.potentialProfit;
            }
          });
        } catch (error) {
          logger.warn('Error calculating exchange pair statistics', { error: error.message });
        }

        const exchangePairStats = Array.from(exchangePairs.entries()).map(([pair, stats]) => ({
          pair,
          count: stats.count,
          totalProfit: stats.totalProfit
        }));

        const stats = {
          totalOpportunities,
          totalTrades,
          totalProfit: Number(totalProfit.toFixed(2)),
          avgPercentageDiff: Number(avgPercentageDiff.toFixed(4)),
          exchangePairStats,
          lastUpdated: new Date().toISOString()
        };

        logger.debug('Generated arbitrage statistics', {
          totalOpportunities,
          totalTrades,
          totalProfit: stats.totalProfit
        });

        return stats;
      },
      {
        maxRetries: 2,
        baseDelay: 1000,
        context: { operation: 'getArbitrageStats' },
        retryCondition: (error) => {
          return error.message.includes('connection') || error.message.includes('timeout');
        }
      }
    );

  } catch (error) {
    const enhancedError = enhanceError(error, { operation: 'getArbitrageStats' });

    logger.error(`Error getting arbitrage stats: ${enhancedError.message}`, {
      error: enhancedError.message,
      code: enhancedError.code,
      stack: enhancedError.stack
    });

    // Return safe fallback values
    return {
      totalOpportunities: 0,
      totalTrades: 0,
      totalProfit: 0,
      avgPercentageDiff: 0,
      exchangePairStats: [],
      lastUpdated: new Date().toISOString(),
      error: 'Failed to retrieve statistics'
    };
  }
}

/**
 * Health check for database operations
 * @returns {Promise<Object>} Health status
 */
async function getDatabaseHealth() {
  try {
    const startTime = Date.now();
    
    // Test basic connectivity
    await Opportunity.findOne({}).limit(1).lean().exec();
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const enhancedError = enhanceError(error, { operation: 'getDatabaseHealth' });
    
    logger.error(`Database health check failed: ${enhancedError.message}`, {
      error: enhancedError.message,
      code: enhancedError.code
    });
    
    return {
      status: 'unhealthy',
      error: enhancedError.message,
      code: enhancedError.code,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  recordArbitrageOpportunity,
  recordTrade,
  getRecentOpportunities,
  getRecentTrades,
  getArbitrageStats,
  getDatabaseHealth
}; 