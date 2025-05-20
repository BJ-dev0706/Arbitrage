# Crypto Arbitrage Bot - Mock Server

This is a mock server for the Crypto Arbitrage Bot that provides test data for frontend development without requiring actual API keys to exchanges.

## Features

- Generates realistic mock data for arbitrage opportunities
- Simulates trades and balances
- Provides the same API endpoints as the real server
- Perfect for UI development and testing

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Run the mock server:
   ```
   npm run mock
   ```
4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## Available Endpoints

The mock server provides the following API endpoints:

- `GET /api/exchanges` - List of supported exchanges
- `GET /api/pairs` - List of trading pairs
- `GET /api/opportunities` - Recent arbitrage opportunities
- `GET /api/trades` - Recent trades
- `GET /api/stats` - Arbitrage statistics
- `GET /api/balances` - Account balances across exchanges

## Mock Data Generation

The mock data is generated randomly but follows the same structure as real data:

- Opportunities are created with random exchanges and trading pairs
- Trades are generated based on opportunities with a 70% success rate
- Balances are randomly generated for all currencies in the trading pairs
- All timestamps are within the last 24 hours

## Using with the Frontend

The mock server is fully compatible with the existing frontend. You can use it to develop and test the UI without connecting to real exchanges.

## Note

This is for development purposes only and should not be used for actual trading decisions. The data is entirely simulated. 