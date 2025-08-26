import { HeliusTransaction } from '../types/transaction';
import { 
  HELIUS_API_KEY, 
  TXN_FETCH_MAX_RETRIES, 
  TXN_FETCH_INITIAL_DELAY, 
  TXN_FETCH_MAX_DELAY,
  TXN_FETCH_FIRST_ATTEMPT_DELAY
} from '../config/constants';

export class HeliusApiService {
  private static readonly API_URL = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;

  static async fetchTransactionDetails(signature: string): Promise<HeliusTransaction | null> {
    let delay = TXN_FETCH_INITIAL_DELAY;
    
    if (TXN_FETCH_FIRST_ATTEMPT_DELAY > 0) {
      console.log(`⏳ Waiting ${TXN_FETCH_FIRST_ATTEMPT_DELAY / 1000} seconds for transaction confirmation...`);
      await this.sleep(TXN_FETCH_FIRST_ATTEMPT_DELAY);
    }
    
    for (let attempt = 1; attempt <= TXN_FETCH_MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Fetching details for: ${signature} (attempt ${attempt}/${TXN_FETCH_MAX_RETRIES})`);
        
        const requestBody = {
          transactions: [signature],
        };
        
        const response = await fetch(this.API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        
        if (data && data.length > 0) {
          console.log(`✅ Processing transaction data...`);
          
          const transaction = data[0];
          
          // ✅ DEBUG: Log timestamp-related fields
          console.log('🔍 Debug - Transaction timestamp fields:');
          console.log('- timestamp:', transaction.timestamp, typeof transaction.timestamp);
          console.log('- blockTime:', transaction.blockTime, typeof transaction.blockTime);
          console.log('- slot:', transaction.slot, typeof transaction.slot);
          
          // Check if meta exists and has timestamp
          if (transaction.meta) {
            console.log('- meta.timestamp:', transaction.meta.timestamp, typeof transaction.meta?.timestamp);
          }
          
          // Log the structure of nested objects that might contain timestamp
          if (transaction.transaction) {
            console.log('- transaction keys:', Object.keys(transaction.transaction));
          }
          
          return transaction as HeliusTransaction;
        } else {
          console.log(`⚠️ No transaction data found for ${signature} (attempt ${attempt})`);
          if (attempt < TXN_FETCH_MAX_RETRIES) {
            await this.sleepWithBackoff(delay);
            delay = Math.min(delay * 1.5, TXN_FETCH_MAX_DELAY);
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching transaction ${signature} (attempt ${attempt}):`, error);
        if (attempt < TXN_FETCH_MAX_RETRIES) {
          await this.sleepWithBackoff(delay);
          delay = Math.min(delay * 1.5, TXN_FETCH_MAX_DELAY);
        }
      }
    }
    
    console.log(`❌ Failed to fetch transaction ${signature} after ${TXN_FETCH_MAX_RETRIES} attempts`);
    return null;
  }

  private static async sleepWithBackoff(delay: number): Promise<void> {
    console.log(`⏳ Waiting ${delay / 1000} seconds before retry...`);
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}