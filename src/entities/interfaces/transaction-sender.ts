import { BigNumber, PopulatedTransaction, Wallet } from 'ethers';
import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';

export interface TransactionData {
  transactionData: PopulatedTransaction;
  blockNumber: number;
  signer: Wallet;
}

export interface TransactionSender {
  sendTransaction(data: TransactionData): Promise<TransactionReceipt | null>;

  simulateTransaction(data: TransactionData): Promise<BigNumber>;
}
