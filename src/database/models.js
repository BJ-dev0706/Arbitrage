const mongoose = require('mongoose');

const opportunitySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  symbol: { type: String, required: true },
  buyExchange: { type: String, required: true },
  sellExchange: { type: String, required: true },
  buyPrice: { type: Number, required: true },
  sellPrice: { type: Number, required: true },
  percentageDifference: { type: Number, required: true },
  potentialProfit: { type: Number, required: true }
}, { timestamps: true });

const tradeSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  symbol: { type: String, required: true },
  buyExchange: { type: String, required: true },
  sellExchange: { type: String, required: true },
  buyPrice: { type: Number, required: true },
  sellPrice: { type: Number, required: true },
  amount: { type: Number, required: true },
  potentialProfit: { type: Number, required: true },
  actualProfit: { type: Number, required: true },
  status: { type: String, enum: ['completed', 'failed'], default: 'completed' }
}, { timestamps: true });

const Opportunity = mongoose.model('Opportunity', opportunitySchema);
const Trade = mongoose.model('Trade', tradeSchema);

module.exports = {
  Opportunity,
  Trade
}; 