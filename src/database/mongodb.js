const mongoose = require('mongoose');
const logger = require('../utils/logger');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/arbitrage';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    logger.info('Connected to MongoDB successfully');
    return true;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    return false;
  }
}

async function disconnectFromDatabase() {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    return true;
  } catch (error) {
    logger.error(`MongoDB disconnection error: ${error.message}`);
    return false;
  }
}

module.exports = {
  connectToDatabase,
  disconnectFromDatabase,
  connection: mongoose.connection
}; 