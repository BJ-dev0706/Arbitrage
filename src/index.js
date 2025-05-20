require('dotenv').config();
const logger = require('./utils/logger');
const { startServer } = require('./server');
const { initializeExchanges } = require('./exchanges');
const { startArbitrageScanner } = require('./arbitrage');
const { setupScheduler } = require('./scheduler');

// Main function to start the bot
async function startBot() {
  try {
    logger.info('Starting Crypto Arbitrage Bot...');
    
    // Initialize exchange connections
    const exchanges = await initializeExchanges();
    logger.info(`Connected to ${Object.keys(exchanges).length} exchanges`);
    
    // Start the arbitrage scanner
    startArbitrageScanner(exchanges);
    
    // Setup scheduled tasks
    setupScheduler(exchanges);
    
    // Start web server for monitoring
    startServer(exchanges);
    
    logger.info('Arbitrage bot running successfully');
  } catch (error) {
    logger.error(`Failed to start bot: ${error.message}`);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Shutting down arbitrage bot...');
  process.exit(0);
});

// Start the bot
startBot(); 