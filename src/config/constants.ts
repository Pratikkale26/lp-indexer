import dotenv from 'dotenv';

dotenv.config();

export const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_API_KEY) {
  throw new Error('HELIUS_API_KEY is not set in .env file');
}

// Helius Enhanced WebSocket URL for transaction streams
export const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Meteora DAMM Program IDs
export const METEORA_DAMM_V1_PROGRAM_ID = 'Eo7WjKq67rjJQSYxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'; // DAMM V1
export const METEORA_DAMM_V2_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'; // DAMM V2

// Common Meteora program IDs that might be involved
export const METEORA_PROGRAMS = [
  METEORA_DAMM_V1_PROGRAM_ID,
  METEORA_DAMM_V2_PROGRAM_ID,
  '24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi', // Meteora DLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',   // Whirlpool (also used by Meteora)
];

// Your specific LP/Pool account address to monitor (DBC pool or DAMM pool)
export const LP_ACCOUNT_ADDRESS = '8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie';

// Connection settings
export const MAX_RETRIES = 10;
export const INITIAL_RETRY_DELAY = 1000;
export const MAX_RETRY_DELAY = 30000;
export const HEARTBEAT_INTERVAL = 300000; // 5 minutes

// Transaction fetching settings
export const TXN_FETCH_MAX_RETRIES = 3;
export const TXN_FETCH_INITIAL_DELAY = 2000; // 2 seconds
export const TXN_FETCH_MAX_DELAY = 10000; // 10 seconds
export const TXN_FETCH_FIRST_ATTEMPT_DELAY = 1000; // 1 second delay before first attempt
