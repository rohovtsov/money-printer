import { providers } from 'ethers';
import { Address, TransactionData, TransactionSender } from '../entities';
import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';

const trnCounts: Record<Address, number> = {};

async function getNextTransactionCount(
  provider: providers.JsonRpcProvider,
  address: Address,
): Promise<number> {
  if (trnCounts[address] !== undefined) {
    return (trnCounts[address] = trnCounts[address] + 1);
  } else {
    return (trnCounts[address] = await provider.getTransactionCount(address));
  }
}

export class Web3TransactionSender implements TransactionSender {
  constructor(readonly provider: providers.JsonRpcProvider, readonly confirmations: number = -1) {}

  async sendTransaction(data: TransactionData): Promise<TransactionReceipt | null> {
    const { signer, transactionData } = data;

    const signedTransaction = await signer.signTransaction({
      ...transactionData,
      nonce: await getNextTransactionCount(this.provider, data.signer.address),
    });
    const result = await this.provider.sendTransaction(signedTransaction);

    console.log(result);

    if (this.confirmations > 0) {
      await result.wait(this.confirmations);
    }

    return this.provider.getTransactionReceipt(result.hash);
  }

  async simulateTransaction(data: TransactionData): Promise<bigint> {
    return 0n;
  }
}
