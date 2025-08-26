// src/index.ts
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_API_KEY) {
  throw new Error('HELIUS_API_KEY is not set in .env file');
}

// Helius Enhanced WebSocket URL for transaction streams
const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Meteora DAMM Program IDs
const METEORA_DAMM_V1_PROGRAM_ID = 'Eo7WjKq67rjJQSYxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'; // DAMM V1
const METEORA_DAMM_V2_PROGRAM_ID = 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'; // DAMM V2

// Common Meteora program IDs that might be involved
const METEORA_PROGRAMS = [
  METEORA_DAMM_V1_PROGRAM_ID,
  METEORA_DAMM_V2_PROGRAM_ID,
  '24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi', // Meteora DLMM
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',   // Whirlpool (also used by Meteora)
];

// Your specific LP/Pool account address to monitor (DBC pool or DAMM pool)
const LP_ACCOUNT_ADDRESS = '8Pm2kZpnxD3hoMmt4bjStX2Pw2Z9abpbHzZxMPqxPmie';

let ws: WebSocket | null = null;
let retryCount = 0;
const maxRetries = 10;
let retryDelay = 1000;
let subscriptionId: number | null = null;

interface HeliusTransaction {
  signature: string;
  slot: number;
  blockTime: number;
  meta: {
    err: any;
    logMessages: string[];
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: any[];
    postTokenBalances: any[];
  };
  transaction: {
    message: {
      accountKeys: string[];
      instructions: any[];
    };
    signatures: string[];
  };
}

function analyzeTransaction(tx: HeliusTransaction): void {
  const timestamp = new Date(tx.blockTime * 1000).toISOString();
  
  console.log('=====================================================');
  console.log(`[${timestamp}] METEORA POOL TRANSACTION DETECTED`);
  console.log(`Transaction ID: ${tx.signature}`);
  console.log(`Slot: ${tx.slot}`);
  console.log(`Solscan: https://solscan.io/tx/${tx.signature}`);
  
  // Check if transaction failed
  if (tx.meta.err) {
    console.log(`❌ Transaction failed: ${JSON.stringify(tx.meta.err)}`);
  } else {
    console.log(`✅ Transaction successful`);
  }

  // Look for relevant logs
  const relevantLogs = tx.meta.logMessages.filter(log => 
    log.includes('swap') || 
    log.includes('Meteora') ||
    log.includes('DAMM') ||
    METEORA_PROGRAMS.some(programId => log.includes(programId)) ||
    log.includes(LP_ACCOUNT_ADDRESS) ||
    log.toLowerCase().includes('liquidity') ||
    log.toLowerCase().includes('pool')
  );

  if (relevantLogs.length > 0) {
    console.log('\n--- RELEVANT LOGS ---');
    relevantLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log}`);
    });
  }

  // Analyze SOL balance changes
  const accountKeys = tx.transaction.message.accountKeys;
  const balanceChanges: Array<{account: string, change: number}> = [];
  
  for (let i = 0; i < accountKeys.length; i++) {
    const preBalance = tx.meta.preBalances[i] || 0;
    const postBalance = tx.meta.postBalances[i] || 0;
    const change = postBalance - preBalance;
    
    if (change !== 0) {
      balanceChanges.push({
        account: accountKeys[i],
        change: change / 1e9 // Convert lamports to SOL
      });
    }
  }

  if (balanceChanges.length > 0) {
    console.log('\n--- SOL BALANCE CHANGES ---');
    balanceChanges.forEach(change => {
      const changeStr = change.change > 0 ? `+${change.change.toFixed(9)}` : change.change.toFixed(9);
      console.log(`${change.account}: ${changeStr} SOL`);
      
      if (change.account === LP_ACCOUNT_ADDRESS) {
        console.log(`  ^^^ THIS IS OUR MONITORED LP ACCOUNT ^^^`);
      }
    });
  }

  // Analyze token balance changes
  if (tx.meta.preTokenBalances.length > 0 || tx.meta.postTokenBalances.length > 0) {
    console.log('\n--- TOKEN BALANCE CHANGES ---');
    
    // Create maps for easier comparison
    const preTokenMap = new Map();
    const postTokenMap = new Map();
    
    tx.meta.preTokenBalances.forEach(balance => {
      const key = `${balance.accountIndex}-${balance.mint}`;
      preTokenMap.set(key, balance);
    });
    
    tx.meta.postTokenBalances.forEach(balance => {
      const key = `${balance.accountIndex}-${balance.mint}`;
      postTokenMap.set(key, balance);
    });
    
    // Find all unique account-mint combinations
    const allKeys = new Set([...preTokenMap.keys(), ...postTokenMap.keys()]);
    
    allKeys.forEach(key => {
      const preBalance = preTokenMap.get(key);
      const postBalance = postTokenMap.get(key);
      
      const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
      const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
      const change = postAmount - preAmount;
      
      if (Math.abs(change) > 0.000001) { // Ignore dust changes
        const tokenBalance = postBalance || preBalance;
        const accountIndex = tokenBalance.accountIndex;
        const account = accountKeys[accountIndex];
        const mint = tokenBalance.mint;
        
        const changeStr = change > 0 ? `+${change.toFixed(6)}` : change.toFixed(6);
        console.log(`${account} (${mint}): ${changeStr} tokens`);
        
        if (account === LP_ACCOUNT_ADDRESS) {
          console.log(`  ^^^ THIS IS OUR MONITORED LP ACCOUNT ^^^`);
        }
      }
    });
  }

  // Show programs involved
  const programs = new Set<string>();
  tx.transaction.message.instructions.forEach(ix => {
    if (ix.programIdIndex !== undefined && accountKeys[ix.programIdIndex]) {
      programs.add(accountKeys[ix.programIdIndex]);
    }
  });

  if (programs.size > 0) {
    console.log('\n--- PROGRAMS INVOKED ---');
    programs.forEach(program => {
      console.log(`- ${program}`);
      if (program === METEORA_DAMM_V1_PROGRAM_ID) {
        console.log('  ^^^ METEORA DAMM V1 PROGRAM ^^^');
      } else if (program === METEORA_DAMM_V2_PROGRAM_ID) {
        console.log('  ^^^ METEORA DAMM V2 PROGRAM ^^^');
      } else if (METEORA_PROGRAMS.includes(program)) {
        console.log('  ^^^ METEORA RELATED PROGRAM ^^^');
      }
    });
  }

  console.log('=====================================================\n');
}

function initializeWebSocket() {
  console.log(`Connecting to Helius Enhanced WebSocket...`);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('✅ WebSocket connected to Helius!');
    retryCount = 0;
    retryDelay = 1000;

    // Use Helius enhanced subscription method
    const subscribeMessage = {
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [
        {
          mentions: [LP_ACCOUNT_ADDRESS] // This will catch any transaction mentioning our LP
        },
        {
          commitment: "confirmed",
          encoding: "jsonParsed"
        }
      ]
    };

    ws?.send(JSON.stringify(subscribeMessage));
    console.log(`🔍 Subscribed to logs mentioning LP: ${LP_ACCOUNT_ADDRESS}`);
    console.log(`📊 Monitoring Meteora DAMM V1: ${METEORA_DAMM_V1_PROGRAM_ID}`);
    console.log(`📊 Monitoring Meteora DAMM V2: ${METEORA_DAMM_V2_PROGRAM_ID}`);
    console.log(`⏰ Waiting for transactions...\n`);
  };

  ws.onmessage = async (event) => {
    try {
      const message = JSON.parse(event.data.toString());

      // Handle subscription confirmation
      if (message.result !== undefined && message.id === 1) {
        subscriptionId = message.result;
        console.log(`✅ Log subscription confirmed with ID: ${subscriptionId}`);
        return;
      }

      // Handle log notifications
      if (message.method === 'logsNotification' && message.params) {
        const logData = message.params.result;
        const signature = logData.value?.signature;
        
        if (signature && logData.value?.logs) {
          console.log(`📋 New logs for transaction: ${signature}`);
          
          // Check if logs contain Meteora/DAMM/swap related content
          const relevantLogs = logData.value.logs.filter((log: string) =>
            log.includes('swap') || 
            log.includes('Meteora') ||
            log.includes('DAMM') ||
            METEORA_PROGRAMS.some(programId => log.includes(programId)) ||
            log.includes(LP_ACCOUNT_ADDRESS) ||
            log.toLowerCase().includes('pool')
          );

          if (relevantLogs.length > 0) {
            console.log('🔍 Fetching full transaction details...');
            
            // Fetch full transaction details using Helius API
            await fetchTransactionDetails(signature);
          }
        }
      }

      // Handle errors
      if (message.error) {
        console.error('❌ WebSocket error in message:', message.error);
      }

    } catch (error) {
      console.error('❌ Error parsing WebSocket message:', error);
    }
  };

  ws.onclose = (event) => {
    console.log(`❌ WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
    
    if (subscriptionId) {
      console.log(`Subscription ${subscriptionId} closed`);
      subscriptionId = null;
    }
    
    reconnect();
  };

  ws.onerror = (error) => {
    console.error('❌ WebSocket error:', error);
  };

  // Heartbeat
  const heartbeatInterval = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      console.log(`💓 Still monitoring LP: ${LP_ACCOUNT_ADDRESS}`);
    }
  }, 300000); // Every 5 minutes

  ws?.once('close', () => {
    clearInterval(heartbeatInterval);
  });
}

async function fetchTransactionDetails(signature: string): Promise<void> {
  try {
    console.log(`🔄 Fetching details for: ${signature}`);
    
    const url = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;
    const requestBody = {
      transactions: [signature]
    };
    
    console.log(`📡 Making API request to: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`📨 Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    const data = await response.json();
    console.log(`📦 Received data for ${data?.length || 0} transactions`);
    
    if (data && data.length > 0) {
      const transaction = data[0];
      console.log(`✅ Processing transaction data...`);
      
      // Convert to our expected format
      const formattedTx: HeliusTransaction = {
        signature: transaction.signature,
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        meta: transaction.meta,
        transaction: transaction.transaction
      };
      
      analyzeTransaction(formattedTx);
    } else {
      console.log(`⚠️ No transaction data found for ${signature}`);
      console.log(`Raw response:`, JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error(`❌ Error fetching transaction ${signature}:`, error);
    
    // If fetch fails, let's try a different approach
    console.log(`🔄 Trying alternative method...`);
    await fetchTransactionDetailsAlternative(signature);
  }
}

async function fetchTransactionDetailsAlternative(signature: string): Promise<void> {
  try {
    // Try using the enhanced transactions API
    const url = `https://api.helius.xyz/v0/transactions/parsed?api-key=${HELIUS_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactions: [signature]
      })
    });

    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        console.log(`✅ Alternative method worked! Processing...`);
        const transaction = data[0];
        
        const formattedTx: HeliusTransaction = {
          signature: transaction.signature,
          slot: transaction.slot,
          blockTime: transaction.blockTime,
          meta: transaction.meta,
          transaction: transaction.transaction
        };
        
        analyzeTransaction(formattedTx);
        return;
      }
    }
    
    console.log(`⚠️ Alternative method also failed. Transaction might be too recent.`);
    
  } catch (error) {
    console.error(`❌ Alternative method failed:`, error);
  }
}

function reconnect() {
  if (retryCount < maxRetries) {
    retryCount++;
    console.log(`🔄 Attempting reconnect ${retryCount}/${maxRetries} in ${retryDelay / 1000} seconds...`);
    
    setTimeout(() => {
      retryDelay = Math.min(retryDelay * 1.5, 30000);
      initializeWebSocket();
    }, retryDelay);
  } else {
    console.error('❌ Max reconnection attempts reached. Exiting.');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (ws && subscriptionId) {
    const unsubscribeMessage = {
      jsonrpc: "2.0",
      id: 999,
      method: "logsUnsubscribe",
      params: [subscriptionId]
    };
    
    ws.send(JSON.stringify(unsubscribeMessage));
    console.log(`📴 Unsubscribed from ${subscriptionId}`);
  }
  
  if (ws) {
    ws.close();
  }
  
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  process.kill(process.pid, 'SIGINT');
});

// Start the monitoring
console.log('🚀 Starting METEORA Pool Transaction Monitor');
console.log(`📍 Target Pool: ${LP_ACCOUNT_ADDRESS}`);
console.log(`🔗 DAMM V1 Program: ${METEORA_DAMM_V1_PROGRAM_ID}`);
console.log(`🔗 DAMM V2 Program: ${METEORA_DAMM_V2_PROGRAM_ID}`);
initializeWebSocket();