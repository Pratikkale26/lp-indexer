export interface HeliusTransaction {
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

export interface BalanceChange {
  account: string;
  change: number;
}

export interface TokenBalance {
  accountIndex: number;
  mint: string;
  uiTokenAmount?: {
    uiAmount: number;
  };
}
