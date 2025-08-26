# Meteora Pool Transaction Monitor

A TypeScript application that monitors Meteora DAMM pool transactions using Helius WebSocket API.

## Project Structure

The project has been restructured into a clean, modular architecture:

```
src/
├── config/
│   └── constants.ts          # Configuration constants and environment variables
├── types/
│   └── transaction.ts        # TypeScript interfaces for transaction data
├── services/
│   ├── transactionAnalyzer.ts # Transaction analysis logic
│   ├── heliusApi.ts          # Helius API service for fetching transaction details
│   └── websocketManager.ts   # WebSocket connection management
├── app.ts                    # Main application orchestrator
└── index.ts                  # Application entry point
```

## Components

### Configuration (`src/config/constants.ts`)
- Environment variables and API keys
- Meteora program IDs
- Connection settings and retry logic parameters

### Types (`src/types/transaction.ts`)
- TypeScript interfaces for transaction data structures
- Balance change and token balance interfaces

### Services

#### Transaction Analyzer (`src/services/transactionAnalyzer.ts`)
- Analyzes transaction data for relevant information
- Extracts SOL and token balance changes
- Identifies programs involved in transactions
- Filters and displays relevant logs

#### Helius API Service (`src/services/heliusApi.ts`)
- Handles API calls to Helius for transaction details
- Formats transaction data for analysis

#### WebSocket Manager (`src/services/websocketManager.ts`)
- Manages WebSocket connection to Helius
- Handles subscription to transaction logs
- Implements reconnection logic and heartbeat
- Graceful shutdown handling

### Application (`src/app.ts`)
- Main application class that orchestrates all services
- Provides clean interface for starting the monitor

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with your Helius API key:
```
HELIUS_API_KEY=your_helius_api_key_here
```

3. Run the application:
```bash
npm start
```

## Configuration

The application includes configurable retry settings for transaction fetching:

- **TXN_FETCH_FIRST_ATTEMPT_DELAY**: Initial delay before first fetch attempt (default: 1 second)
- **TXN_FETCH_MAX_RETRIES**: Maximum number of retry attempts (default: 3)
- **TXN_FETCH_INITIAL_DELAY**: Delay between retry attempts (default: 2 seconds)
- **TXN_FETCH_MAX_DELAY**: Maximum delay between retries (default: 10 seconds)

These settings help handle blockchain confirmation delays and ensure reliable transaction data retrieval.

## Features

- **Real-time Monitoring**: WebSocket connection to Helius for live transaction monitoring
- **Transaction Analysis**: Detailed analysis of Meteora pool transactions
- **Balance Tracking**: Monitor SOL and token balance changes
- **Program Detection**: Identify Meteora DAMM programs involved in transactions
- **Automatic Reconnection**: Robust connection handling with exponential backoff
- **Graceful Shutdown**: Clean shutdown on SIGINT/SIGTERM signals
- **Smart Retry Logic**: Automatic retry with delays for transaction fetching to handle blockchain confirmation delays

## Monitoring

The application monitors:
- Meteora DAMM V1 Program: `Eo7WjKq67rjJQSYxS6z3YkapzY3eMj6Xy8X5EQVn5UaB`
- Meteora DAMM V2 Program: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`
- Target LP Account: `8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie`

## Output

The application provides detailed console output including:
- Transaction signatures and Solscan links
- SOL balance changes for all accounts
- Token balance changes
- Programs involved in transactions
- Relevant log messages
- Transaction success/failure status
