import { providers } from 'ethers';
import {
  TransactionData,
  TransactionSender
} from '../entities';
import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';



export class Web3TransactionSender implements TransactionSender {
  constructor(
    readonly provider: providers.JsonRpcProvider,
    readonly confirmations: number = -1
  ) { }

  async sendTransaction(data: TransactionData): Promise<TransactionReceipt | null> {
    const { signer, transactionData } = data;

    const signedTransaction = await signer.signTransaction({
      ...transactionData,
      nonce: await this.provider.getTransactionCount(data.signer.address),
    });
    const result = await this.provider.sendTransaction(signedTransaction);

    console.log(result);

    if (this.confirmations > 0) {
      await result.wait(this.confirmations);
    }

    return this.provider.getTransactionReceipt(result.hash);
  }

  async simulateTransaction(data: TransactionData): Promise<void> {

  }
}
