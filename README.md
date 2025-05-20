# Cryptocurrency Arbitrage Bot

A powerful bot for detecting and executing arbitrage opportunities across multiple cryptocurrency exchanges.

## What is Arbitrage?

Arbitrage is the practice of taking advantage of price differences for the same asset across different markets. In cryptocurrency trading, this involves:

1. Buying a cryptocurrency on one exchange where the price is lower
2. Selling it on another exchange where the price is higher
3. Profiting from the price difference

This bot automates this process by continuously monitoring prices across exchanges and executing trades when profitable opportunities are detected.

## Features

- Real-time price monitoring across multiple cryptocurrency exchanges
- Automated arbitrage opportunity detection
- Configurable trading parameters (thresholds, amounts, etc.)
- Simulation mode for testing without real trades
- Web dashboard for monitoring performance
- Detailed logging and trade history
- Scheduled balance checks and maintenance tasks

## Supported Exchanges

- Binance
- Coinbase
- Kraken

More exchanges can be added easily by extending the configuration.

## Getting Started

### Prerequisites

- Node.js 14.x or higher
- API keys for the exchanges you want to trade on

### Installation

1. Clone this repository:
   ```
   git clone https://github.com/BJ-dev0706/Arbitrage.git
   cd Arbitrage
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure your API keys:
   - Copy `.env.example` to `.env`
   - Add your exchange API keys to the `.env` file

### Configuration

Edit the `.env` file to configure the bot:

```
# Exchange API Keys
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET_KEY=your_binance_secret_key

COINBASE_API_KEY=your_coinbase_api_key
COINBASE_SECRET_KEY=your_coinbase_secret_key

KRAKEN_API_KEY=your_kraken_api_key
KRAKEN_SECRET_KEY=your_kraken_secret_key

# Bot Configuration
ARBITRAGE_THRESHOLD=0.5  # Minimum percentage difference to execute trades
TRADE_AMOUNT=100         # Amount in USDT to use for each trade
ENABLE_TRADING=false     # Set to true to enable real trading
LOG_LEVEL=info           # Logging level (info, warn, error, debug)
```

### Usage

1. Start the bot in simulation mode:
   ```
   npm start
   ```

2. Once you're confident in the bot's performance, enable real trading by setting `ENABLE_TRADING=true` in your `.env` file.

3. Access the dashboard at http://localhost:3000 to monitor performance.

## Dashboard

The web dashboard provides:

- Real-time overview of arbitrage opportunities
- Trade history and performance
- Exchange balance information
- Statistics and analytics

## Safety Considerations

- Always start in simulation mode (default setting) to test the bot's performance
- Start with small trade amounts when switching to real trading
- Regularly monitor the bot's performance and exchange balances
- Be aware of exchange trading fees, which can affect profitability

## Adding New Exchanges

To add support for a new exchange:

1. Add API key configuration to the `.env` file
2. Add the exchange configuration to the `SUPPORTED_EXCHANGES` object in `src/exchanges/index.js`
3. Test thoroughly in simulation mode before enabling real trading

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Disclaimer

Cryptocurrency trading involves significant risk. This software is provided for educational and informational purposes only. Use at your own risk. The authors are not responsible for any financial losses incurred through the use of this software. 