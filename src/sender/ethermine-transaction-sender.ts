import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';
import {
  ArbitrageOpportunity,
  createEthermineBundleProvider,
  NETWORK,
  sleep,
  TransactionData,
  TransactionSender,
} from '../entities';
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} from '@flashbots/ethers-provider-bundle';
import { providers } from 'ethers';
import fetch from 'node-fetch';

const resolutionsMap: Record<FlashbotsBundleResolution, string> = {
  [FlashbotsBundleResolution.BundleIncluded]: 'BundleIncluded',
  [FlashbotsBundleResolution.AccountNonceTooHigh]: 'AccountNonceTooHigh',
  [FlashbotsBundleResolution.BlockPassedWithoutInclusion]: 'BlockPassedWithoutInclusion',
};

interface EthermineReportItem {
  blockNumber: string;
  hash: string;
  msg: string;
  ts: number;
  sinceBlockReceived: number;
}

export class EthermineTransactionSender implements TransactionSender {
  readonly type = 'ethermine';

  constructor(readonly ethermineProvider: FlashbotsBundleProvider) {}

  async sendTransaction(data: TransactionData): Promise<TransactionReceipt | null> {
    if (NETWORK !== 'mainnet') {
      return null;
    }

    const { signer, transactionData, blockNumber } = data;

    const signedBundle = await this.ethermineProvider.signBundle([
      {
        signer: signer,
        transaction: transactionData,
      },
    ]);

    try {
      const transaction = await this.ethermineProvider.sendRawBundle(
        signedBundle,
        data.blockNumber,
      );

      if ('error' in transaction) {
        throw transaction;
      }

      const hash = transaction!.bundleHash;
      console.log(
        `Ethermine transaction. Sent: ${hash} at ${blockNumber} - since block was received: ${
          Date.now() - data.opportunity.blockReceivedAt!
        }ms`,
      );

      const result = await transaction.wait();
      const receipt = ((await transaction.receipts()) ?? [])?.[0] ?? null;
      this.logResultReport(hash, data.opportunity, result, receipt);

      return receipt;
    } catch (err: any) {
      throw err;
    }

    /* const response = await fetch(this.endpoint, {
      method: 'POST',
      body: JSON.stringify({
        id: 0,
        jsonrpc: '2.0',
        method: 'eth_sendBundle',
        params: [
          {
            txs : [ signedTrn ],
            blockNumber : `0x${data.blockNumber.toString(16)}`,
            //?
            //"minTimestamp" : 0
          }
        ]
      })
    }).then(r => r.json());

    console.log(response);*/
  }

  private async logResultReport(
    hash: string,
    opportunity: ArbitrageOpportunity,
    resolution: FlashbotsBundleResolution,
    receipt: TransactionReceipt | null,
  ): Promise<void> {
    console.log(`Ethermine ${hash}. Resolution: ${resolutionsMap[resolution]}`);
    console.log(`Ethermine ${hash}. Receipt:`, receipt);

    try {
      const report = await this.pollReport(hash, opportunity.blockReceivedAt!);

      console.log(`Ethermine ${hash}. Bundle stats:`, report);
    } catch (err) {
      console.log(`Ethermine ${hash} Error while getting stats.`, err);
    }
  }

  private async pollReport(
    bundleHash: string,
    blockReceivedAt: number,
  ): Promise<EthermineReportItem[]> {
    const items = (await fetch(`https://mev-relay.ethermine.org/${bundleHash}`, {
      method: 'GET',
    }).then((r) => r.json())) as EthermineReportItem[];

    for (const item of items) {
      if (item.ts) {
        item.sinceBlockReceived = Math.floor(item.ts / 1000000) - blockReceivedAt;
      }
    }

    if (!items.length) {
      const MINUTE = 60000;
      await sleep(6 * MINUTE);
      return this.pollReport(bundleHash, blockReceivedAt);
    }

    return items;
  }

  static async create(provider: providers.JsonRpcProvider): Promise<EthermineTransactionSender> {
    return new EthermineTransactionSender(await createEthermineBundleProvider(provider));
  }
}
