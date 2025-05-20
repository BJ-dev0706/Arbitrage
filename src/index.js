require('dotenv').config();
const logger = require('./utils/logger');
const { startServer } = require('./server');
const { initializeExchanges } = require('./exchanges');
const { startArbitrageScanner } = require('./arbitrage');
const { setupScheduler } = require('./scheduler');

async function startBot() {
  try {
    logger.info('Starting Crypto Arbitrage Bot...');
    
    const exchanges = await initializeExchanges();
    logger.info(`Connected to ${Object.keys(exchanges).length} exchanges`);
    
    startArbitrageScanner(exchanges);
    
    setupScheduler(exchanges);
    
    startServer(exchanges);
    
    logger.info('Arbitrage bot running successfully');
  } catch (error) {
    logger.error(`Failed to start bot: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down arbitrage bot...');
  process.exit(0);
});

startBot(); 