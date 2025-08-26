import { HeliusTransaction } from '../types/transaction';
import { 
  HELIUS_API_KEY, 
  TXN_FETCH_MAX_RETRIES, 
  TXN_FETCH_INITIAL_DELAY, 
  TXN_FETCH_MAX_DELAY,
  TXN_FETCH_FIRST_ATTEMPT_DELAY
} from '../config/constants';

export class HeliusApiService {
  private static readonly API_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

  static async fetchTransactionDetails(signature: string): Promise<HeliusTransaction | null> {
    let delay = TXN_FETCH_INITIAL_DELAY;
    
    // Add initial delay before first attempt to allow transaction to be confirmed
    if (TXN_FETCH_FIRST_ATTEMPT_DELAY > 0) {
      console.log(`⏳ Waiting ${TXN_FETCH_FIRST_ATTEMPT_DELAY / 1000} seconds for transaction confirmation...`);
      await this.sleep(TXN_FETCH_FIRST_ATTEMPT_DELAY);
    }
    
    for (let attempt = 1; attempt <= TXN_FETCH_MAX_RETRIES; attempt++) {
      try {
        console.log(`🔄 Fetching details for: ${signature} (attempt ${attempt}/${TXN_FETCH_MAX_RETRIES})`);
        
        const requestBody = {
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            {
              encoding: "jsonParsed",
              maxSupportedTransactionVersion: 0
            }
          ]
        };
        
        const response = await fetch(this.API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.result) {
          console.log(`✅ Processing transaction data...`);
          
          const transaction = data.result;
          const formattedTx: HeliusTransaction = {
            signature: signature,
            slot: transaction.slot,
            blockTime: transaction.blockTime,
            meta: transaction.meta,
            transaction: transaction.transaction
          };
          
          return formattedTx;
        } else {
          console.log(`⚠️ No transaction data found for ${signature} (attempt ${attempt})`);
          
          // If this is not the last attempt, wait before retrying
          if (attempt < TXN_FETCH_MAX_RETRIES) {
            console.log(`⏳ Waiting ${delay / 1000} seconds before retry...`);
            await this.sleep(delay);
            delay = Math.min(delay * 1.5, TXN_FETCH_MAX_DELAY); // Exponential backoff
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching transaction ${signature} (attempt ${attempt}):`, error);
        
        // If this is not the last attempt, wait before retrying
        if (attempt < TXN_FETCH_MAX_RETRIES) {
          console.log(`⏳ Waiting ${delay / 1000} seconds before retry...`);
          await this.sleep(delay);
          delay = Math.min(delay * 1.5, TXN_FETCH_MAX_DELAY); // Exponential backoff
        }
      }
    }
    
    console.log(`❌ Failed to fetch transaction ${signature} after ${TXN_FETCH_MAX_RETRIES} attempts`);
    return null;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
