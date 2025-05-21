const logger = require('../utils/logger');
const { connectToDatabase } = require('./mongodb');
const { Opportunity, Trade } = require('./models');

connectToDatabase();

/**
 * Record an arbitrage opportunity
 * @param {Object} opportunity - Arbitrage opportunity details
 * @returns {Promise<Boolean>} Success status
 */
async function recordArbitrageOpportunity(opportunity) {
  try {
    await Opportunity.create(opportunity);
    return true;
  } catch (error) {
    logger.error(`Error recording arbitrage opportunity: ${error.message}`);
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
    await Trade.create(trade);
    return true;
  } catch (error) {
    logger.error(`Error recording trade: ${error.message}`);
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
    return await Opportunity.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    logger.error(`Error getting recent opportunities: ${error.message}`);
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
    return await Trade.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
  } catch (error) {
    logger.error(`Error getting recent trades: ${error.message}`);
    return [];
  }
}

/**
 * Get arbitrage statistics
 * @returns {Promise<Object>} Statistics
 */
async function getArbitrageStats() {
  try {
    const totalOpportunities = await Opportunity.countDocuments();
    const totalTrades = await Trade.countDocuments();
    
    const trades = await Trade.find({});
    const totalProfit = trades.reduce((sum, trade) => sum + trade.potentialProfit, 0);
    
    const opportunities = await Opportunity.find({});
    const totalPercentageDiff = opportunities.reduce((sum, opp) => sum + opp.percentageDifference, 0);
    const avgPercentageDiff = opportunities.length > 0 ? totalPercentageDiff / opportunities.length : 0;
    
    const exchangePairs = new Map();
    opportunities.forEach(opp => {
      const key = `${opp.buyExchange}-${opp.sellExchange}`;
      if (!exchangePairs.has(key)) {
        exchangePairs.set(key, { count: 0, totalProfit: 0 });
      }
      
      const pairStats = exchangePairs.get(key);
      pairStats.count++;
      
      const relatedTrade = trades.find(t => 
        t.buyExchange === opp.buyExchange && 
        t.sellExchange === opp.sellExchange && 
        t.timestamp.getTime() === opp.timestamp.getTime()
      );
      
      if (relatedTrade) {
        pairStats.totalProfit += relatedTrade.potentialProfit;
      }
    });
    
    const exchangePairStats = Array.from(exchangePairs.entries()).map(([pair, stats]) => ({
      pair,
      count: stats.count,
      totalProfit: stats.totalProfit
    }));
    
    return {
      totalOpportunities,
      totalTrades,
      totalProfit,
      avgPercentageDiff,
      exchangePairStats
    };
  } catch (error) {
    logger.error(`Error getting arbitrage stats: ${error.message}`);
    return {
      totalOpportunities: 0,
      totalTrades: 0,
      totalProfit: 0,
      avgPercentageDiff: 0,
      exchangePairStats: []
    };
  }
}

module.exports = {
  recordArbitrageOpportunity,
  recordTrade,
  getRecentOpportunities,
  getRecentTrades,
  getArbitrageStats
}; 