const ccxt = require('ccxt');
const logger = require('../utils/logger');

// Map of supported exchanges and their configuration
const SUPPORTED_EXCHANGES = {
  binance: {
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET_KEY,
    options: { defaultType: 'spot' }
  },
  coinbase: {
    apiKey: process.env.COINBASE_API_KEY,
    secret: process.env.COINBASE_SECRET_KEY
  },
  kraken: {
    apiKey: process.env.KRAKEN_API_KEY,
    secret: process.env.KRAKEN_SECRET_KEY
  }
};

// Common trading pairs to monitor
const TRADING_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 
  'ADA/USDT', 'SOL/USDT', 'XRP/USDT',
  'DOT/USDT', 'DOGE/USDT', 'AVAX/USDT'
];

/**
 * Initialize connections to all configured exchanges
 * @returns {Object} Map of exchange instances
 */
async function initializeExchanges() {
  const exchanges = {};
  
  for (const [exchangeId, config] of Object.entries(SUPPORTED_EXCHANGES)) {
    try {
      // Skip exchanges with missing API keys
      if (!config.apiKey || config.apiKey === 'your_' + exchangeId + '_api_key') {
        logger.warn(`Skipping ${exchangeId} - API keys not configured`);
        continue;
      }
      
      // Create exchange instance
      const ExchangeClass = ccxt[exchangeId];
      const exchange = new ExchangeClass(config);
      
      // Load markets for the exchange
      await exchange.loadMarkets();
      logger.info(`Connected to ${exchangeId} - ${Object.keys(exchange.markets).length} markets available`);
      
      // Add to exchanges map
      exchanges[exchangeId] = exchange;
    } catch (error) {
      logger.error(`Failed to initialize ${exchangeId}: ${error.message}`);
    }
  }
  
  return exchanges;
}

/**
 * Fetch ticker data for a specific trading pair from an exchange
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @returns {Object} Ticker data
 */
async function fetchTicker(exchange, symbol) {
  try {
    return await exchange.fetchTicker(symbol);
  } catch (error) {
    logger.error(`Failed to fetch ${symbol} ticker from ${exchange.id}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch order book for a specific trading pair from an exchange
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @param {Number} limit - Number of orders to fetch
 * @returns {Object} Order book data
 */
async function fetchOrderBook(exchange, symbol, limit = 5) {
  try {
    return await exchange.fetchOrderBook(symbol, limit);
  } catch (error) {
    logger.error(`Failed to fetch ${symbol} order book from ${exchange.id}: ${error.message}`);
    return null;
  }
}

/**
 * Execute a market buy order
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @param {Number} amount - Amount to buy
 * @returns {Object} Order result
 */
async function executeBuy(exchange, symbol, amount) {
  try {
    if (process.env.ENABLE_TRADING !== 'true') {
      logger.info(`[SIMULATION] Buy ${amount} ${symbol} on ${exchange.id}`);
      return { simulated: true, symbol, amount, type: 'buy' };
    }
    
    return await exchange.createMarketBuyOrder(symbol, amount);
  } catch (error) {
    logger.error(`Failed to execute buy for ${symbol} on ${exchange.id}: ${error.message}`);
    return null;
  }
}

/**
 * Execute a market sell order
 * @param {Object} exchange - CCXT exchange instance
 * @param {String} symbol - Trading pair symbol
 * @param {Number} amount - Amount to sell
 * @returns {Object} Order result
 */
async function executeSell(exchange, symbol, amount) {
  try {
    if (process.env.ENABLE_TRADING !== 'true') {
      logger.info(`[SIMULATION] Sell ${amount} ${symbol} on ${exchange.id}`);
      return { simulated: true, symbol, amount, type: 'sell' };
    }
    
    return await exchange.createMarketSellOrder(symbol, amount);
  } catch (error) {
    logger.error(`Failed to execute sell for ${symbol} on ${exchange.id}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch account balance from an exchange
 * @param {Object} exchange - CCXT exchange instance
 * @returns {Object} Balance data
 */
async function fetchBalance(exchange) {
  try {
    return await exchange.fetchBalance();
  } catch (error) {
    logger.error(`Failed to fetch balance from ${exchange.id}: ${error.message}`);
    return null;
  }
}

module.exports = {
  initializeExchanges,
  fetchTicker,
  fetchOrderBook,
  executeBuy,
  executeSell,
  fetchBalance,
  TRADING_PAIRS
}; 