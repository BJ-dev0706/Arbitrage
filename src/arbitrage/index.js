const logger = require('../utils/logger');
const { TRADING_PAIRS, fetchOrderBook, executeBuy, executeSell } = require('../exchanges');
const { recordArbitrageOpportunity, recordTrade } = require('../database');

const ARBITRAGE_THRESHOLD = parseFloat(process.env.ARBITRAGE_THRESHOLD || '0.5');
const TRADE_AMOUNT = parseFloat(process.env.TRADE_AMOUNT || '100');

const activeArbitrageOps = new Map();

/**
 * Start the arbitrage scanner
 * @param {Object} exchanges - Map of exchange instances
 */
function startArbitrageScanner(exchanges) {
  logger.info(`Starting arbitrage scanner with ${ARBITRAGE_THRESHOLD}% threshold`);
  
  setInterval(() => scanForArbitrageOpportunities(exchanges), 10000);
  
  scanForArbitrageOpportunities(exchanges);
}

/**
 * Scan for arbitrage opportunities across all exchanges and trading pairs
 * @param {Object} exchanges - Map of exchange instances
 */
async function scanForArbitrageOpportunities(exchanges) {
  const exchangeIds = Object.keys(exchanges);
  if (exchangeIds.length < 2) {
    logger.warn('Need at least 2 exchanges for arbitrage, only found ' + exchangeIds.length);
    return;
  }
  
  for (const symbol of TRADING_PAIRS) {
    await scanPairAcrossExchanges(exchanges, symbol);
  }
}

/**
 * Scan a specific trading pair across all exchanges
 * @param {Object} exchanges - Map of exchange instances
 * @param {String} symbol - Trading pair symbol
 */
async function scanPairAcrossExchanges(exchanges, symbol) {
  const priceData = [];
  const exchangeIds = Object.keys(exchanges);
  
  for (const exchangeId of exchangeIds) {
    const exchange = exchanges[exchangeId];
    
    try {
      if (!exchange.markets || !exchange.markets[symbol]) {
        continue;
      }
      
      const orderBook = await fetchOrderBook(exchange, symbol);
      if (!orderBook || !orderBook.bids || !orderBook.asks || orderBook.bids.length === 0 || orderBook.asks.length === 0) {
        continue;
      }
      
      const bestBid = orderBook.bids[0][0];
      const bestAsk = orderBook.asks[0][0];
      
      priceData.push({
        exchange: exchangeId,
        exchangeObj: exchange,
        symbol,
        bestBid,
        bestAsk
      });
    } catch (error) {
      logger.error(`Error fetching ${symbol} data from ${exchangeId}: ${error.message}`);
    }
  }
  
  if (priceData.length < 2) {
    return;
  }
  
  priceData.sort((a, b) => b.bestBid - a.bestBid);
  const highestBid = priceData[0];
  
  priceData.sort((a, b) => a.bestAsk - b.bestAsk);
  const lowestAsk = priceData[0];
  
  if (highestBid.exchange === lowestAsk.exchange) {
    return;
  }
  
  const priceDiff = highestBid.bestBid - lowestAsk.bestAsk;
  const percentageDiff = (priceDiff / lowestAsk.bestAsk) * 100;
  
  if (percentageDiff > ARBITRAGE_THRESHOLD) {
    const opportunity = {
      symbol,
      buyExchange: lowestAsk.exchange,
      sellExchange: highestBid.exchange,
      buyPrice: lowestAsk.bestAsk,
      sellPrice: highestBid.bestBid,
      priceDifference: priceDiff,
      percentageDifference: percentageDiff,
      potentialProfit: priceDiff * (TRADE_AMOUNT / lowestAsk.bestAsk),
      timestamp: new Date().toISOString()
    };
    
    logger.info(`ARBITRAGE OPPORTUNITY: ${symbol} - Buy on ${lowestAsk.exchange} at ${lowestAsk.bestAsk}, Sell on ${highestBid.exchange} at ${highestBid.bestBid} - ${percentageDiff.toFixed(2)}% difference`);
    
    recordArbitrageOpportunity(opportunity);
    
    const key = `${symbol}-${lowestAsk.exchange}-${highestBid.exchange}`;
    if (!activeArbitrageOps.has(key)) {
      executeArbitrage(lowestAsk.exchangeObj, highestBid.exchangeObj, symbol, TRADE_AMOUNT, opportunity);
      activeArbitrageOps.set(key, Date.now());
      
      setTimeout(() => {
        activeArbitrageOps.delete(key);
      }, 60000);
    }
  }
}

/**
 * Execute an arbitrage opportunity
 * @param {Object} buyExchange - Exchange to buy on
 * @param {Object} sellExchange - Exchange to sell on
 * @param {String} symbol - Trading pair symbol
 * @param {Number} amount - Amount to trade in quote currency
 * @param {Object} opportunity - Arbitrage opportunity details
 */
async function executeArbitrage(buyExchange, sellExchange, symbol, amount, opportunity) {
  try {
    const baseAmount = amount / opportunity.buyPrice;
    
    logger.info(`Executing buy order for ${baseAmount} ${symbol} on ${buyExchange.id} at ${opportunity.buyPrice}`);
    const buyOrder = await executeBuy(buyExchange, symbol, baseAmount);
    
    if (!buyOrder) {
      logger.error(`Failed to execute buy order on ${buyExchange.id}`);
      return;
    }
    
    logger.info(`Executing sell order for ${baseAmount} ${symbol} on ${sellExchange.id} at ${opportunity.sellPrice}`);
    const sellOrder = await executeSell(sellExchange, symbol, baseAmount);
    
    if (!sellOrder) {
      logger.error(`Failed to execute sell order on ${sellExchange.id}`);
      return;
    }
    
    const trade = {
      ...opportunity,
      buyOrderId: buyOrder.id || 'simulated',
      sellOrderId: sellOrder.id || 'simulated',
      baseAmount,
      quoteAmount: amount,
      completed: true,
      completedAt: new Date().toISOString()
    };
    
    recordTrade(trade);
    logger.info(`Successfully executed arbitrage: ${trade.potentialProfit.toFixed(2)} profit`);
  } catch (error) {
    logger.error(`Error executing arbitrage: ${error.message}`);
  }
}

module.exports = {
  startArbitrageScanner
}; 