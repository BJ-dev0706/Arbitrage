const express = require('express');
const path = require('path');
const logger = require('../utils/logger');
const { 
  getRecentOpportunities, 
  getRecentTrades, 
  getArbitrageStats 
} = require('../database');
const { TRADING_PAIRS, fetchBalance } = require('../exchanges');

/**
 * Start the monitoring web server
 * @param {Object} exchanges - Map of exchange instances
 */
function startServer(exchanges) {
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  app.use(express.static(path.join(__dirname, 'public')));
  
  app.get('/api/exchanges', (req, res) => {
    res.json(Object.keys(exchanges));
  });
  
  app.get('/api/pairs', (req, res) => {
    res.json(TRADING_PAIRS);
  });
  
  app.get('/api/opportunities', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(getRecentOpportunities(limit));
  });
  
  app.get('/api/trades', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(getRecentTrades(limit));
  });
  
  app.get('/api/stats', (req, res) => {
    res.json(getArbitrageStats());
  });
  
  app.get('/api/balances', async (req, res) => {
    const balances = {};
    
    for (const [exchangeId, exchange] of Object.entries(exchanges)) {
      try {
        const balance = await fetchBalance(exchange);
        
        if (balance) {
          const relevantBalances = {};
          const relevantCurrencies = new Set();
          
          TRADING_PAIRS.forEach(pair => {
            const [base, quote] = pair.split('/');
            relevantCurrencies.add(base);
            relevantCurrencies.add(quote);
          });
          
          for (const currency of relevantCurrencies) {
            if (balance.free && balance.free[currency]) {
              relevantBalances[currency] = {
                free: balance.free[currency],
                used: balance.used?.[currency] || 0,
                total: balance.total?.[currency] || balance.free[currency]
              };
            }
          }
          
          balances[exchangeId] = relevantBalances;
        }
      } catch (error) {
        logger.error(`Error fetching balance from ${exchangeId}: ${error.message}`);
      }
    }
    
    res.json(balances);
  });
  
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  const publicDir = path.join(__dirname, 'public');
  if (!require('fs').existsSync(publicDir)) {
    require('fs').mkdirSync(publicDir, { recursive: true });
  }
  
  app.listen(PORT, () => {
    logger.info(`Monitoring server started on http://localhost:${PORT}`);
  });
}

module.exports = {
  startServer
};