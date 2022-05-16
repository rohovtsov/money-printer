import { PopulatedTransaction, Wallet } from 'ethers';
import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';
import { ArbitrageOpportunity } from './arbitrage-strategy';

export interface TransactionData {
  transactionData: PopulatedTransaction;
  blockNumber: number;
  signer: Wallet;
  opportunity: ArbitrageOpportunity;
}

export interface TransactionSender {
  sendTransaction(data: TransactionData): Promise<TransactionReceipt | null>;

  simulateTransaction(data: TransactionData): Promise<bigint>;
}
