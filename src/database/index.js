const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');
const OPPORTUNITIES_FILE = path.join(DATA_DIR, 'opportunities.json');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

for (const file of [OPPORTUNITIES_FILE, TRADES_FILE]) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify([], null, 2));
  }
}

/**
 * Read data from a JSON file
 * @param {String} filePath - Path to the JSON file
 * @returns {Array} Data from the file
 */
function readData(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading data from ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Write data to a JSON file
 * @param {String} filePath - Path to the JSON file
 * @param {Array} data - Data to write
 * @returns {Boolean} Success status
 */
function writeData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error writing data to ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Record an arbitrage opportunity
 * @param {Object} opportunity - Arbitrage opportunity details
 * @returns {Boolean} Success status
 */
function recordArbitrageOpportunity(opportunity) {
  const opportunities = readData(OPPORTUNITIES_FILE);
  opportunities.push(opportunity);
  
  const trimmedOpportunities = opportunities.slice(-1000);
  
  return writeData(OPPORTUNITIES_FILE, trimmedOpportunities);
}

/**
 * Record a completed arbitrage trade
 * @param {Object} trade - Trade details
 * @returns {Boolean} Success status
 */
function recordTrade(trade) {
  const trades = readData(TRADES_FILE);
  trades.push(trade);
  return writeData(TRADES_FILE, trades);
}

/**
 * Get recent arbitrage opportunities
 * @param {Number} limit - Maximum number of opportunities to return
 * @returns {Array} Recent opportunities
 */
function getRecentOpportunities(limit = 100) {
  const opportunities = readData(OPPORTUNITIES_FILE);
  return opportunities.slice(-limit).reverse();
}

/**
 * Get recent trades
 * @param {Number} limit - Maximum number of trades to return
 * @returns {Array} Recent trades
 */
function getRecentTrades(limit = 100) {
  const trades = readData(TRADES_FILE);
  return trades.slice(-limit).reverse();
}

/**
 * Get arbitrage statistics
 * @returns {Object} Statistics
 */
function getArbitrageStats() {
  const opportunities = readData(OPPORTUNITIES_FILE);
  const trades = readData(TRADES_FILE);
  
  const totalProfit = trades.reduce((sum, trade) => sum + trade.potentialProfit, 0);
  
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
      t.timestamp === opp.timestamp
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
    totalOpportunities: opportunities.length,
    totalTrades: trades.length,
    totalProfit,
    avgPercentageDiff,
    exchangePairStats
  };
}

module.exports = {
  recordArbitrageOpportunity,
  recordTrade,
  getRecentOpportunities,
  getRecentTrades,
  getArbitrageStats
}; 