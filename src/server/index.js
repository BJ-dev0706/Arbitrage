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
  
  // Serve static files
  app.use(express.static(path.join(__dirname, 'public')));
  
  // API routes
  
  // Get all exchange names
  app.get('/api/exchanges', (req, res) => {
    res.json(Object.keys(exchanges));
  });
  
  // Get trading pairs
  app.get('/api/pairs', (req, res) => {
    res.json(TRADING_PAIRS);
  });
  
  // Get recent arbitrage opportunities
  app.get('/api/opportunities', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(getRecentOpportunities(limit));
  });
  
  // Get recent trades
  app.get('/api/trades', (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(getRecentTrades(limit));
  });
  
  // Get arbitrage statistics
  app.get('/api/stats', (req, res) => {
    res.json(getArbitrageStats());
  });
  
  // Get exchange balances
  app.get('/api/balances', async (req, res) => {
    const balances = {};
    
    for (const [exchangeId, exchange] of Object.entries(exchanges)) {
      try {
        const balance = await fetchBalance(exchange);
        
        if (balance) {
          // Extract only the relevant currencies
          const relevantBalances = {};
          const relevantCurrencies = new Set();
          
          // Extract unique currencies from trading pairs
          TRADING_PAIRS.forEach(pair => {
            const [base, quote] = pair.split('/');
            relevantCurrencies.add(base);
            relevantCurrencies.add(quote);
          });
          
          // Filter and format balances
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
  
  // Dashboard HTML
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
  // Create public directory if it doesn't exist
  const publicDir = path.join(__dirname, 'public');
  if (!require('fs').existsSync(publicDir)) {
    require('fs').mkdirSync(publicDir, { recursive: true });
  }
  
  // Create a basic HTML dashboard
  const dashboardHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Arbitrage Bot Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body { padding-top: 20px; }
        .card { margin-bottom: 20px; }
        .opportunity-row:hover, .trade-row:hover { background-color: #f8f9fa; }
        .profit-positive { color: green; }
        .profit-negative { color: red; }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="mb-4">Crypto Arbitrage Bot Dashboard</h1>
        
        <div class="row">
            <div class="col-md-4">
                <div class="card">
                    <div class="card-header">Stats</div>
                    <div class="card-body" id="stats-container">
                        <p>Loading statistics...</p>
                    </div>
                </div>
            </div>
            
            <div class="col-md-8">
                <div class="card">
                    <div class="card-header">Exchange Balances</div>
                    <div class="card-body" id="balances-container">
                        <p>Loading balances...</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">Recent Arbitrage Opportunities</div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Symbol</th>
                                        <th>Buy Exchange</th>
                                        <th>Sell Exchange</th>
                                        <th>Buy Price</th>
                                        <th>Sell Price</th>
                                        <th>Difference %</th>
                                        <th>Potential Profit</th>
                                    </tr>
                                </thead>
                                <tbody id="opportunities-container">
                                    <tr><td colspan="8">Loading opportunities...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="row">
            <div class="col-md-12">
                <div class="card">
                    <div class="card-header">Recent Trades</div>
                    <div class="card-body">
                        <div class="table-responsive">
                            <table class="table table-striped">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Symbol</th>
                                        <th>Buy Exchange</th>
                                        <th>Sell Exchange</th>
                                        <th>Buy Price</th>
                                        <th>Sell Price</th>
                                        <th>Amount</th>
                                        <th>Profit</th>
                                    </tr>
                                </thead>
                                <tbody id="trades-container">
                                    <tr><td colspan="8">Loading trades...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Format timestamps
        function formatTime(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleString();
        }
        
        // Format currency
        function formatCurrency(amount) {
            return parseFloat(amount).toFixed(2);
        }
        
        // Load stats
        async function loadStats() {
            const response = await fetch('/api/stats');
            const stats = await response.json();
            
            let html = \`
                <div class="row">
                    <div class="col-6"><strong>Total Opportunities:</strong></div>
                    <div class="col-6">\${stats.totalOpportunities}</div>
                </div>
                <div class="row">
                    <div class="col-6"><strong>Total Trades:</strong></div>
                    <div class="col-6">\${stats.totalTrades}</div>
                </div>
                <div class="row">
                    <div class="col-6"><strong>Total Profit:</strong></div>
                    <div class="col-6">\${formatCurrency(stats.totalProfit)} USDT</div>
                </div>
                <div class="row">
                    <div class="col-6"><strong>Avg Difference:</strong></div>
                    <div class="col-6">\${formatCurrency(stats.avgPercentageDiff)}%</div>
                </div>
                <hr>
                <h6>Top Exchange Pairs</h6>
            \`;
            
            // Sort exchange pairs by count
            const topPairs = stats.exchangePairStats.sort((a, b) => b.count - a.count).slice(0, 5);
            
            topPairs.forEach(pair => {
                html += \`
                    <div class="row">
                        <div class="col-6"><strong>\${pair.pair}:</strong></div>
                        <div class="col-6">\${pair.count} opps / \${formatCurrency(pair.totalProfit)} USDT</div>
                    </div>
                \`;
            });
            
            document.getElementById('stats-container').innerHTML = html;
        }
        
        // Load balances
        async function loadBalances() {
            const response = await fetch('/api/balances');
            const balances = await response.json();
            
            let html = '<div class="accordion" id="balancesAccordion">';
            
            Object.entries(balances).forEach(([exchangeId, currencies], index) => {
                html += \`
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="heading\${index}">
                            <button class="accordion-button \${index > 0 ? 'collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse\${index}" aria-expanded="\${index === 0}" aria-controls="collapse\${index}">
                                \${exchangeId.toUpperCase()}
                            </button>
                        </h2>
                        <div id="collapse\${index}" class="accordion-collapse collapse \${index === 0 ? 'show' : ''}" aria-labelledby="heading\${index}" data-bs-parent="#balancesAccordion">
                            <div class="accordion-body">
                                <table class="table table-sm">
                                    <thead>
                                        <tr>
                                            <th>Currency</th>
                                            <th>Free</th>
                                            <th>Used</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                \`;
                
                Object.entries(currencies).forEach(([currency, balance]) => {
                    html += \`
                        <tr>
                            <td>\${currency}</td>
                            <td>\${balance.free}</td>
                            <td>\${balance.used}</td>
                            <td>\${balance.total}</td>
                        </tr>
                    \`;
                });
                
                html += \`
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                \`;
            });
            
            html += '</div>';
            
            document.getElementById('balances-container').innerHTML = html;
        }
        
        // Load opportunities
        async function loadOpportunities() {
            const response = await fetch('/api/opportunities?limit=10');
            const opportunities = await response.json();
            
            if (opportunities.length === 0) {
                document.getElementById('opportunities-container').innerHTML = '<tr><td colspan="8">No opportunities found</td></tr>';
                return;
            }
            
            let html = '';
            
            opportunities.forEach(opp => {
                html += \`
                    <tr class="opportunity-row">
                        <td>\${formatTime(opp.timestamp)}</td>
                        <td>\${opp.symbol}</td>
                        <td>\${opp.buyExchange}</td>
                        <td>\${opp.sellExchange}</td>
                        <td>\${opp.buyPrice}</td>
                        <td>\${opp.sellPrice}</td>
                        <td>\${opp.percentageDifference.toFixed(2)}%</td>
                        <td class="profit-positive">\${formatCurrency(opp.potentialProfit)} USDT</td>
                    </tr>
                \`;
            });
            
            document.getElementById('opportunities-container').innerHTML = html;
        }
        
        // Load trades
        async function loadTrades() {
            const response = await fetch('/api/trades?limit=10');
            const trades = await response.json();
            
            if (trades.length === 0) {
                document.getElementById('trades-container').innerHTML = '<tr><td colspan="8">No trades found</td></tr>';
                return;
            }
            
            let html = '';
            
            trades.forEach(trade => {
                const profitClass = trade.potentialProfit >= 0 ? 'profit-positive' : 'profit-negative';
                
                html += \`
                    <tr class="trade-row">
                        <td>\${formatTime(trade.completedAt || trade.timestamp)}</td>
                        <td>\${trade.symbol}</td>
                        <td>\${trade.buyExchange}</td>
                        <td>\${trade.sellExchange}</td>
                        <td>\${trade.buyPrice}</td>
                        <td>\${trade.sellPrice}</td>
                        <td>\${trade.baseAmount ? trade.baseAmount.toFixed(6) : '-'}</td>
                        <td class="\${profitClass}">\${formatCurrency(trade.potentialProfit)} USDT</td>
                    </tr>
                \`;
            });
            
            document.getElementById('trades-container').innerHTML = html;
        }
        
        // Initial load
        loadStats();
        loadBalances();
        loadOpportunities();
        loadTrades();
        
        // Refresh every 30 seconds
        setInterval(() => {
            loadStats();
            loadBalances();
            loadOpportunities();
            loadTrades();
        }, 30000);
    </script>
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `;
  
  // Write the dashboard HTML file
  require('fs').writeFileSync(path.join(publicDir, 'index.html'), dashboardHtml);
  
  // Start the server
  app.listen(PORT, () => {
    logger.info(`Monitoring server started on http://localhost:${PORT}`);
  });
}

module.exports = {
  startServer
};