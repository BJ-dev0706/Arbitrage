require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/arbitrage';

async function testConnection() {
  logger.info('Testing MongoDB connection...');
  logger.info(`Using connection string: ${MONGO_URI}`);
  
  try {
    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB successfully!');
    
    const state = mongoose.connection.readyState;
    logger.info(`Connection state: ${state === 1 ? 'Connected' : 'Not connected'}`);
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    logger.info(`Database name: ${db.databaseName}`);
    logger.info(`Collections: ${collections.map(c => c.name).join(', ') || 'None'}`);
    
    logger.info('MongoDB connection test completed successfully');
    
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    logger.error(error.stack);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

testConnection(); 