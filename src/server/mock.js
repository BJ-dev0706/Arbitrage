const express = require('express');
const path = require('path');
const logger = require('../utils/logger');
const { TRADING_PAIRS } = require('../exchanges');

/**
 * Generate mock opportunities data
 * @param {Number} count - Number of opportunities to generate
 * @returns {Array} Mock opportunities
 */
function generateMockOpportunities(count = 100) {
  const opportunities = [];
  const exchanges = ['binance', 'coinbase', 'kraken'];
  
  for (let i = 0; i < count; i++) {
    const symbol = TRADING_PAIRS[Math.floor(Math.random() * TRADING_PAIRS.length)];
    const buyExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    let sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    
    // Ensure buy and sell exchanges are different
    while (sellExchange === buyExchange) {
      sellExchange = exchanges[Math.floor(Math.random() * exchanges.length)];
    }
    
    const buyPrice = 100 + (Math.random() * 10);
    const sellPrice = buyPrice * (1 + (Math.random() * 0.05));
    const priceDifference = sellPrice - buyPrice;
    const percentageDifference = (priceDifference / buyPrice) * 100;
    const potentialProfit = priceDifference * (100 / buyPrice);
    
    // Generate timestamp within last 24 hours
    const timestamp = new Date(Date.now() - Math.floor(Math.random() * 24 * 60 * 60 * 1000)).toISOString();
    
    opportunities.push({
      symbol,
      buyExchange,
      sellExchange,
      buyPrice,
      sellPrice,
      priceDifference,
      percentageDifference,
      potentialProfit,
      timestamp
    });
  }
  
  // Sort by timestamp descending
  return opportunities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/**
 * Generate mock trades data based on opportunities
 * @param {Array} opportunities - Opportunities data
 * @param {Number} successRate - Success rate (0-1)
 * @returns {Array} Mock trades
 */
function generateMockTrades(opportunities, successRate = 0.7) {
  return opportunities
    .filter(() => Math.random() < successRate)
    .map(opportunity => {
      const baseAmount = 100 / opportunity.buyPrice;
      
      return {
        ...opportunity,
        buyOrderId: `mock-buy-${Math.random().toString(36).substring(2, 10)}`,
        sellOrderId: `mock-sell-${Math.random().toString(36).substring(2, 10)}`,
        baseAmount,
        quoteAmount: 100,
        completed: true,
        completedAt: new Date(new Date(opportunity.timestamp).getTime() + 10000).toISOString()
      };
    });
}

/**
 * Generate mock stats based on opportunities and trades
 * @param {Array} opportunities - Opportunities data
 * @param {Array} trades - Trades data
 * @returns {Object} Mock stats
 */
function generateMockStats(opportunities, trades) {
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

/**
 * Generate mock balances data
 * @returns {Object} Mock balances
 */
function generateMockBalances() {
  const exchanges = ['binance', 'coinbase', 'kraken'];
  const currencies = [...new Set(TRADING_PAIRS.flatMap(pair => pair.split('/')))];
  const balances = {};
  
  exchanges.forEach(exchange => {
    const exchangeBalances = {};
    
    currencies.forEach(currency => {
      const total = Math.random() * 1000;
      const used = Math.random() * (total * 0.3);
      const free = total - used;
      
      exchangeBalances[currency] = {
        free,
        used,
        total
      };
    });
    
    balances[exchange] = exchangeBalances;
  });
  
  return balances;
}

/**
 * Start the mock monitoring web server
 */
function startMockServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  app.use(express.static(path.join(__dirname, 'public')));
  
  // Generate mock data
  const mockOpportunities = generateMockOpportunities(100);
  const mockTrades = generateMockTrades(mockOpportunities);
  const mockStats = generateMockStats(mockOpportunities, mockTrades);
  const mockBalances = generateMockBalances();
  
  app.get('/api/exchanges', (req, res) => {
    res.json(['binance', 'coinbase', 'kraken']);
  });
  
  app.get('/api/pairs', (req, res) => {
    res.json(TRADING_PAIRS);
  });
  
  app.get('/api/opportunities', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(mockOpportunities.slice(0, limit));
  });
  
  app.get('/api/trades', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(mockTrades.slice(0, limit));
  });
  
  app.get('/api/stats', (req, res) => {
    res.json(mockStats);
  });
  
  app.get('/api/balances', (req, res) => {
    res.json(mockBalances);
  });
  
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  const publicDir = path.join(__dirname, 'public');
  if (!require('fs').existsSync(publicDir)) {
    require('fs').mkdirSync(publicDir, { recursive: true });
  }
  
  app.listen(PORT, () => {
    logger.info(`Mock monitoring server started on http://localhost:${PORT}`);
  });
}

module.exports = {
  startMockServer
}; 