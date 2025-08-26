import WebSocket from 'ws';
import { 
  WS_URL, 
  LP_ACCOUNT_ADDRESS, 
  METEORA_PROGRAMS, 
  METEORA_DAMM_V1_PROGRAM_ID, 
  METEORA_DAMM_V2_PROGRAM_ID,
  MAX_RETRIES,
  INITIAL_RETRY_DELAY,
  MAX_RETRY_DELAY,
  HEARTBEAT_INTERVAL
} from '../config/constants';
import { TransactionAnalyzer } from './transactionAnalyzer';
import { HeliusApiService } from './heliusApi';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private retryDelay = INITIAL_RETRY_DELAY;
  private subscriptionId: number | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupGracefulShutdown();
  }

  initialize(): void {
    console.log(`Connecting to Helius Enhanced WebSocket...`);
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected to Helius!');
      this.retryCount = 0;
      this.retryDelay = INITIAL_RETRY_DELAY;
      this.subscribe();
      this.startHeartbeat();
    };

    this.ws.onmessage = async (event) => {
      await this.handleMessage(event);
    };

    this.ws.onclose = (event) => {
      console.log(`❌ WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
      
      if (this.subscriptionId) {
        console.log(`Subscription ${this.subscriptionId} closed`);
        this.subscriptionId = null;
      }
      
      this.stopHeartbeat();
      this.reconnect();
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };
  }

  private subscribe(): void {
    if (!this.ws) return;

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

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log(`🔍 Subscribed to logs mentioning LP: ${LP_ACCOUNT_ADDRESS}`);
    console.log(`📊 Monitoring Meteora DAMM V1: ${METEORA_DAMM_V1_PROGRAM_ID}`);
    console.log(`📊 Monitoring Meteora DAMM V2: ${METEORA_DAMM_V2_PROGRAM_ID}`);
    console.log(`⏰ Waiting for transactions...\n`);
  }

  private async handleMessage(event: WebSocket.MessageEvent): Promise<void> {
    try {
      const message = JSON.parse(event.data.toString());

      // Handle subscription confirmation
      if (message.result !== undefined && message.id === 1) {
        this.subscriptionId = message.result;
        console.log(`✅ Log subscription confirmed with ID: ${this.subscriptionId}`);
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
            const transaction = await HeliusApiService.fetchTransactionDetails(signature);
            if (transaction) {
              TransactionAnalyzer.analyzeTransaction(transaction);
            }
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
  }

  private reconnect(): void {
    if (this.retryCount < MAX_RETRIES) {
      this.retryCount++;
      console.log(`🔄 Attempting reconnect ${this.retryCount}/${MAX_RETRIES} in ${this.retryDelay / 1000} seconds...`);
      
      setTimeout(() => {
        this.retryDelay = Math.min(this.retryDelay * 1.5, MAX_RETRY_DELAY);
        this.initialize();
      }, this.retryDelay);
    } else {
      console.error('❌ Max reconnection attempts reached. Exiting.');
      process.exit(1);
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        console.log(`💓 Still monitoring LP: ${LP_ACCOUNT_ADDRESS}`);
      }
    }, HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private setupGracefulShutdown(): void {
    process.on('SIGINT', () => {
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down...');
      this.shutdown();
    });
  }

  private shutdown(): void {
    console.log('\n🛑 Shutting down gracefully...');
    
    if (this.ws && this.subscriptionId) {
      const unsubscribeMessage = {
        jsonrpc: "2.0",
        id: 999,
        method: "logsUnsubscribe",
        params: [this.subscriptionId]
      };
      
      this.ws.send(JSON.stringify(unsubscribeMessage));
      console.log(`📴 Unsubscribed from ${this.subscriptionId}`);
    }
    
    this.stopHeartbeat();
    
    if (this.ws) {
      this.ws.close();
    }
    
    setTimeout(() => {
      console.log('👋 Goodbye!');
      process.exit(0);
    }, 1000);
  }
}
