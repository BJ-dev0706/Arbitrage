require('dotenv').config();
const logger = require('./utils/logger');
const { startMockServer } = require('./server/mock');

async function startMock() {
  try {
    logger.info('Starting Crypto Arbitrage Mock Server...');
    
    startMockServer();
    
    logger.info('Mock server running successfully');
  } catch (error) {
    logger.error(`Failed to start mock server: ${error.message}`);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down mock server...');
  process.exit(0);
});

startMock(); 