import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
if (!HELIUS_API_KEY) {
  throw new Error('HELIUS_API_KEY is not set in .env file');
}

const WS_URL = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

// Raydium AMM Program ID
const RAYDIUM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
// Your specific LP account address to monitor
const LP_ACCOUNT_ADDRESS = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv';

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
  console.log(`[${timestamp}] LP TRANSACTION DETECTED`);
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
    log.includes('Raydium') ||
    log.includes(RAYDIUM_PROGRAM_ID) ||
    log.includes(LP_ACCOUNT_ADDRESS) ||
    log.toLowerCase().includes('liquidity')
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
      if (program === RAYDIUM_PROGRAM_ID) {
        console.log('  ^^^ RAYDIUM AMM PROGRAM ^^^');
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
    console.log(`📊 Will analyze transactions involving: ${RAYDIUM_PROGRAM_ID}`);
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
        
        // if (signature && logData.value?.logs) {
        //   console.log(`📋 New logs for transaction: ${signature}`);
          
        //   // Check if logs contain Raydium/swap related content
        //   const relevantLogs = logData.value.logs.filter((log: string) =>
        //     log.includes('swap') || 
        //     log.includes('Raydium') ||
        //     log.includes(RAYDIUM_PROGRAM_ID) ||
        //     log.includes(LP_ACCOUNT_ADDRESS)
        //   );

        //   if (relevantLogs.length > 0) {
        //     console.log('🔍 Fetching full transaction details...');
            
        //     // Fetch full transaction details using Helius API
        //     await fetchTransactionDetails(signature);
        //   }
        // }
        if (signature) { // We only need to check if the signature exists
          console.log(`📋 New logs for transaction: ${signature}`);
          console.log('✅ Helius confirmed relevance, fetching full details...');
          
          // Directly fetch the details without the extra check
          await fetchTransactionDetails(signature);
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
    const response = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transactions: [signature]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const transaction = data[0];
      
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
    }
  } catch (error) {
    console.error(`❌ Error fetching transaction ${signature}:`, error);
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
console.log('🚀 Starting LP Transaction Monitor');
console.log(`📍 Target LP: ${LP_ACCOUNT_ADDRESS}`);
console.log(`🔗 Raydium Program: ${RAYDIUM_PROGRAM_ID}`);
initializeWebSocket();
