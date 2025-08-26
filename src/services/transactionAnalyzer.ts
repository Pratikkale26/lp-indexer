import { HeliusTransaction, BalanceChange } from '../types/transaction';
import { 
  METEORA_PROGRAMS, 
  METEORA_DAMM_V1_PROGRAM_ID, 
  METEORA_DAMM_V2_PROGRAM_ID, 
  LP_ACCOUNT_ADDRESS 
} from '../config/constants';

export class TransactionAnalyzer {
  static analyzeTransaction(tx: HeliusTransaction): void {

    // REVERTED: Your original, correct timestamp logic is restored.
    const timestamp = tx.blockTime
      ? new Date(tx.blockTime * 1000).toISOString()
      : '[TIMESTAMP PENDING]';

    console.log('=====================================================');
    console.log(`[${timestamp}] METEORA POOL TRANSACTION DETECTED`);
    console.log(`Transaction ID: ${tx.signature}`);
    console.log(`Slot: ${tx.slot}`);
    console.log(`Solscan: https://solscan.io/tx/${tx.signature}`);
    
    // This fix is still essential to prevent crashes when `meta` is missing.
    if (tx.meta?.err) {
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
    // ESSENTIAL FIX: Safely access logMessages and provide an empty array as a fallback.
    const relevantLogs = (tx.meta?.logMessages ?? []).filter(log => 
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
    // ESSENTIAL FIX: Safely access accountKeys and balance arrays.
    const accountKeys = tx.transaction?.message?.accountKeys ?? [];
    const preBalances = tx.meta?.preBalances ?? [];
    const postBalances = tx.meta?.postBalances ?? [];
    const balanceChanges: BalanceChange[] = [];
    
    for (let i = 0; i < accountKeys.length; i++) {
      const preBalance = preBalances[i] || 0;
      const postBalance = postBalances[i] || 0;
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
    // ESSENTIAL FIX: Safely access token balance arrays.
    const preTokenBalances = tx.meta?.preTokenBalances ?? [];
    const postTokenBalances = tx.meta?.postTokenBalances ?? [];
    const accountKeys = tx.transaction?.message?.accountKeys ?? [];

    if (preTokenBalances.length > 0 || postTokenBalances.length > 0) {
      console.log('\n--- TOKEN BALANCE CHANGES ---');
      
      const preTokenMap = new Map();
      const postTokenMap = new Map();
      
      preTokenBalances.forEach(balance => {
        const key = `${balance.accountIndex}-${balance.mint}`;
        preTokenMap.set(key, balance);
      });
      
      postTokenBalances.forEach(balance => {
        const key = `${balance.accountIndex}-${balance.mint}`;
        postTokenMap.set(key, balance);
      });
      
      const allKeys = new Set([...preTokenMap.keys(), ...postTokenMap.keys()]);
      
      allKeys.forEach(key => {
        const preBalance = preTokenMap.get(key);
        const postBalance = postTokenMap.get(key);
        
        const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
        const postAmount = postBalance?.uiTokenAmount?.uiAmount || 0;
        const change = postAmount - preAmount;
        
        if (Math.abs(change) > 0.000001) {
          const tokenBalance = postBalance || preBalance;
          const accountIndex = tokenBalance.accountIndex;
          const account = accountKeys[accountIndex];
          const mint = tokenBalance.mint;
          
          if (!account || !mint) return;

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
    // ESSENTIAL FIX: Safely access instructions and accountKeys.
    const accountKeys = tx.transaction?.message?.accountKeys ?? [];
    const instructions = tx.transaction?.message?.instructions ?? [];
    const programs = new Set<string>();
    
    instructions.forEach(ix => {
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