import { HeliusTransaction, BalanceChange } from '../types/transaction';
import { 
  METEORA_PROGRAMS, 
  METEORA_DAMM_V1_PROGRAM_ID, 
  METEORA_DAMM_V2_PROGRAM_ID, 
  LP_ACCOUNT_ADDRESS 
} from '../config/constants';

export class TransactionAnalyzer {
  static analyzeTransaction(tx: HeliusTransaction): void {
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

    this.analyzeRelevantLogs(tx);
    this.analyzeSolBalanceChanges(tx);
    this.analyzeTokenBalanceChanges(tx);
    this.analyzeProgramsInvolved(tx);

    console.log('=====================================================\n');
  }

  private static analyzeRelevantLogs(tx: HeliusTransaction): void {
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
  }

  private static analyzeSolBalanceChanges(tx: HeliusTransaction): void {
    const accountKeys = tx.transaction.message.accountKeys;
    const balanceChanges: BalanceChange[] = [];
    
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
  }

  private static analyzeTokenBalanceChanges(tx: HeliusTransaction): void {
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
          const account = tx.transaction.message.accountKeys[accountIndex];
          const mint = tokenBalance.mint;
          
          const changeStr = change > 0 ? `+${change.toFixed(6)}` : change.toFixed(6);
          console.log(`${account} (${mint}): ${changeStr} tokens`);
          
          if (account === LP_ACCOUNT_ADDRESS) {
            console.log(`  ^^^ THIS IS OUR MONITORED LP ACCOUNT ^^^`);
          }
        }
      });
    }
  }

  private static analyzeProgramsInvolved(tx: HeliusTransaction): void {
    const accountKeys = tx.transaction.message.accountKeys;
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
  }
}
