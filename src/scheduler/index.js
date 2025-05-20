const schedule = require('node-schedule');
const logger = require('../utils/logger');
const { fetchBalance } = require('../exchanges');

/**
 * Setup scheduled tasks
 * @param {Object} exchanges - Map of exchange instances
 */
function setupScheduler(exchanges) {
  logger.info('Setting up scheduled tasks...');
  
  // Schedule balance check every hour
  schedule.scheduleJob('0 * * * *', () => {
    logger.info('Running scheduled balance check...');
    checkBalances(exchanges);
  });
  
  // Schedule data cleanup daily at midnight
  schedule.scheduleJob('0 0 * * *', () => {
    logger.info('Running scheduled data cleanup...');
    cleanupData();
  });
}

/**
 * Check and log balances across all exchanges
 * @param {Object} exchanges - Map of exchange instances
 */
async function checkBalances(exchanges) {
  logger.info('Checking balances across exchanges...');
  
  for (const [exchangeId, exchange] of Object.entries(exchanges)) {
    try {
      const balance = await fetchBalance(exchange);
      if (balance) {
        logger.info(`Balance for ${exchangeId}:`);
        
        // Log only non-zero balances
        for (const [currency, amount] of Object.entries(balance.total || {})) {
          if (amount > 0) {
            logger.info(`  ${currency}: ${amount}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Error checking balance for ${exchangeId}: ${error.message}`);
    }
  }
}

/**
 * Clean up old data
 */
function cleanupData() {
  // This would normally trim old records from the database
  // For our file-based storage, the database module already handles this
  logger.info('Data cleanup completed');
}

module.exports = {
  setupScheduler
};