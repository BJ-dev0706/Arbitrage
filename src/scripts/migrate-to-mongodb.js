require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectToDatabase, disconnectFromDatabase } = require('../database/mongodb');
const { Opportunity, Trade } = require('../database/models');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');
const OPPORTUNITIES_FILE = path.join(DATA_DIR, 'opportunities.json');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');

/**
 * Read data from a JSON file
 * @param {String} filePath - Path to the JSON file
 * @returns {Array} Data from the file
 */
function readData(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading data from ${filePath}: ${error.message}`);
    return [];
  }
}

/**
 * Migrate opportunities from JSON to MongoDB
 * @returns {Promise<Number>} Number of opportunities migrated
 */
async function migrateOpportunities() {
  const opportunities = readData(OPPORTUNITIES_FILE);
  if (opportunities.length === 0) {
    logger.info('No opportunities to migrate');
    return 0;
  }

  try {
    const formattedOpportunities = opportunities.map(opp => ({
      ...opp,
      timestamp: opp.timestamp ? new Date(opp.timestamp) : new Date()
    }));

    const result = await Opportunity.insertMany(formattedOpportunities);
    logger.info(`Migrated ${result.length} opportunities to MongoDB`);
    return result.length;
  } catch (error) {
    logger.error(`Error migrating opportunities: ${error.message}`);
    return 0;
  }
}

/**
 * Migrate trades from JSON to MongoDB
 * @returns {Promise<Number>} Number of trades migrated
 */
async function migrateTrades() {
  const trades = readData(TRADES_FILE);
  if (trades.length === 0) {
    logger.info('No trades to migrate');
    return 0;
  }

  try {
    const formattedTrades = trades.map(trade => ({
      ...trade,
      timestamp: trade.timestamp ? new Date(trade.timestamp) : new Date()
    }));

    const result = await Trade.insertMany(formattedTrades);
    logger.info(`Migrated ${result.length} trades to MongoDB`);
    return result.length;
  } catch (error) {
    logger.error(`Error migrating trades: ${error.message}`);
    return 0;
  }
}

/**
 * Run the migration
 */
async function runMigration() {
  logger.info('Starting migration to MongoDB...');
  
  try {
    const connected = await connectToDatabase();
    if (!connected) {
      logger.error('Failed to connect to MongoDB. Migration aborted.');
      process.exit(1);
    }

    const shouldClearExisting = process.argv.includes('--clear');
    if (shouldClearExisting) {
      logger.info('Clearing existing MongoDB data...');
      await Opportunity.deleteMany({});
      await Trade.deleteMany({});
    }

    const opportunitiesCount = await migrateOpportunities();
    const tradesCount = await migrateTrades();

    logger.info(`Migration completed. Migrated ${opportunitiesCount} opportunities and ${tradesCount} trades.`);
  } catch (error) {
    logger.error(`Migration failed: ${error.message}`);
  } finally {
    await disconnectFromDatabase();
  }
}

runMigration(); 