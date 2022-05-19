import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';
import {
  FlashbotsBundleProvider,
  FlashbotsBundleResolution,
} from '@flashbots/ethers-provider-bundle';
import { providers } from 'ethers';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import { concatMap, Subject } from 'rxjs';
import {
  Address,
  ArbitrageOpportunity,
  createFlashbotsBundleProvider,
  NETWORK,
  printOpportunity,
  sleep,
  TransactionData,
  TransactionSender,
} from '../entities';
import { GetBundleStatsResponseSuccess } from '@flashbots/ethers-provider-bundle/src';

const storePath = `simulations/${NETWORK}.json`;

const resolutionsMap: Record<FlashbotsBundleResolution, string> = {
  [FlashbotsBundleResolution.BundleIncluded]: 'BundleIncluded',
  [FlashbotsBundleResolution.AccountNonceTooHigh]: 'AccountNonceTooHigh',
  [FlashbotsBundleResolution.BlockPassedWithoutInclusion]: 'BlockPassedWithoutInclusion',
};

export class FlashbotsTransactionSender implements TransactionSender {
  private opportunityResults$ = new Subject<{
    opportunity: ArbitrageOpportunity;
    result: boolean;
  }>();
  private map = JSON.parse(readFileSync(storePath, { encoding: 'utf8' }));
  private rateLimitedTill = 0;

  constructor(
    readonly flashbotsProvider: FlashbotsBundleProvider,
    readonly provider: providers.JsonRpcProvider,
  ) {
    this.opportunityStore();
  }

  private getRateLimitDelay(): number {
    return Math.max(this.rateLimitedTill ? this.rateLimitedTill - Date.now() : 0, 0);
  }

  private handleRateLimitError(err: any): boolean {
    const ratelimitResetAt = Number(err?.headers?.['x-ratelimit-reset']) * 1000;

    if (ratelimitResetAt && !isNaN(ratelimitResetAt)) {
      this.rateLimitedTill = Math.max(this.rateLimitedTill, ratelimitResetAt);
      return true;
    } else {
      return false;
    }
  }

  async sendTransaction(data: TransactionData): Promise<TransactionReceipt | null> {
    const delay = this.getRateLimitDelay();
    if (delay > 0) {
      await sleep(delay);
    }

    const { signer, transactionData, blockNumber } = data;
    const signedBundle = await this.flashbotsProvider.signBundle([
      {
        signer: signer,
        transaction: transactionData,
      },
    ]);

    try {
      const transaction = await this.flashbotsProvider.sendRawBundle(signedBundle, blockNumber);

      if ('error' in transaction) {
        console.log(transaction);
        throw new Error('Relay Error');
      }

      const hash = transaction?.bundleHash;
      console.log(
        `Flashbots transaction. Sent: ${hash} at ${blockNumber} - since block was received: ${
          Date.now() - data.opportunity.blockReceivedAt!
        }ms`,
      );
      const result = await transaction.wait();
      const receipt = ((await transaction.receipts()) ?? [])?.[0] ?? null;
      await this.logResultReport(hash, data.opportunity, result, receipt, blockNumber);

      return receipt;
    } catch (err: any) {
      if (this.handleRateLimitError(err)) {
        console.log(
          `Flashbots transaction send rate limited. Wake up in ${
            this.rateLimitedTill - Date.now()
          }ms`,
        );
        return this.sendTransaction(data);
      } else {
        throw err;
      }
    }
  }

  async simulateTransaction(data: TransactionData): Promise<bigint> {
    //this.simulateWithFlashbots(data);
    return this.simulateWithEstimate(data);
  }

  private async simulateWithFlashbots(data: TransactionData): Promise<bigint> {
    const { signer, transactionData, blockNumber } = data;

    const signedBundle = await this.flashbotsProvider.signBundle([
      {
        signer: signer,
        transaction: transactionData,
      },
    ]);

    try {
      const simulation = await this.flashbotsProvider.simulate(signedBundle, blockNumber);

      if ('error' in simulation || simulation.firstRevert !== undefined) {
        this.opportunityResults$.next({ opportunity: data.opportunity, result: false });
        throw simulation;
      }

      this.opportunityResults$.next({ opportunity: data.opportunity, result: true });

      return BigInt(simulation.totalGasUsed);
    } catch (err: any) {
      if (this.handleRateLimitError(err)) {
        console.log(`Simulation rate limited. Wake up in ${this.rateLimitedTill - Date.now()}ms`);
        throw err;
      } else {
        throw err;
      }
    }
  }

  private async simulateWithEstimate(data: TransactionData): Promise<bigint> {
    try {
      //множитель кароче 1.25
      const nominator = 100n;
      const denominator = 125n;

      const estimatedGas = (
        await this.provider.estimateGas({
          ...data.transactionData,
          from: data.signer.address,
        })
      ).toBigInt();

      return (estimatedGas * nominator) / denominator + 1n;
    } catch (e) {
      throw e;
    }
  }

  private async logResultReport(
    hash: string,
    opportunity: ArbitrageOpportunity,
    resolution: FlashbotsBundleResolution,
    receipt: TransactionReceipt | null,
    blocKNumber: number,
  ): Promise<void> {
    console.log(`Flashbots ${hash}. Resolution: ${resolutionsMap[resolution]}`);
    console.log(`Flashbots ${hash}. Receipt:`, receipt);
    console.log(`Flashbots ${hash}. User stats:`, await this.flashbotsProvider.getUserStats());

    if (receipt === null) {
      try {
        const bundleStats = (await this.flashbotsProvider.getBundleStats(
          hash,
          blocKNumber,
        )) as GetBundleStatsResponseSuccess;
        const simulatedAt = bundleStats?.simulatedAt
          ? new Date(bundleStats!.simulatedAt).getTime()
          : opportunity.blockReceivedAt!;
        const submittedAt = bundleStats?.submittedAt
          ? new Date(bundleStats!.submittedAt).getTime()
          : opportunity.blockReceivedAt!;
        const sentToMinersAt = bundleStats?.sentToMinersAt
          ? new Date(bundleStats!.sentToMinersAt).getTime()
          : opportunity.blockReceivedAt!;

        console.log(`Flashbots ${hash}. Bundle stats:`, bundleStats, {
          simulatedIn: simulatedAt - opportunity.blockReceivedAt!,
          submittedIn: submittedAt - opportunity.blockReceivedAt!,
          sentToMinersIn: sentToMinersAt - opportunity.blockReceivedAt!,
        });
        /*//TODO: this call affects reputation https://docs.flashbots.net/flashbots-auction/searchers/advanced/troubleshooting#detecting
        console.log(
          `Flashbots ${hash}. Conflicting bundles:`,
          await this.flashbotsProvider.getConflictingBundle(signedBundle, blocKNumber),
        );*/
      } catch (err) {
        console.log(`Flashbots ${hash} Error while getting stats.`, err);
      }
    }
  }

  private opportunityStore(): void {
    this.opportunityResults$
      .pipe(
        concatMap(async ({ opportunity, result }): Promise<void> => {
          opportunity.operations.forEach((op) => {
            if (!this.map[op.market.marketAddress]) {
              this.map[op.market.marketAddress] = [0, 0];
              this.map = Object.keys(this.map)
                .sort()
                .reduce((obj: Record<string, [number, number]>, key) => {
                  obj[key] = this.map[key];
                  return obj;
                }, {});
            }
            this.map[op.market.marketAddress][result ? 0 : 1] += 1;
          });

          return fs.writeFile(storePath, JSON.stringify(this.map, null, 2));
        }),
      )
      .subscribe(() => {});
  }

  static async create(
    provider: providers.JsonRpcProvider,
    network?: string,
    signingKey?: Address,
  ): Promise<FlashbotsTransactionSender> {
    return new FlashbotsTransactionSender(
      await createFlashbotsBundleProvider(provider, network, signingKey),
      provider,
    );
  }
}

/*
  [
  {
    to: '0x28cee28a7C4b4022AC92685C07d2f33Ab1A0e122',
    from: '0x5e9a214bf9864143e44778F9729B230083388cDB',
    contractAddress: null,
    transactionIndex: 1,
    gasUsed: BigNumber { _hex: '0x03ac56', _isBigNumber: true },
logsBloom: '0x20200000000000000000000080000000100000000000000000000002000000080000000000000000000000000000001000000000000000000000020000000002400000001400000000000008100100200000000000600000000400000000080008000000000000000000000000000000000000000080040000000010000000000000001000000000000000100000000000000000000000080000004000000108040000000000000000000000000000000000000000001000000000040000000002004003001000000000000000000000000000000000001000000002000000008000000000000000000001000000000000000000000000000000000000802000',
  blockHash: '0x046a54de0e6478c324ea0e911784d3815a8a5d3514941690417ba8795df04aa9',
  transactionHash: '0x88212f75419a9aa92c5e30b6f8882469addc80672682fcb843357adb081e4a34',
  logs: [
  [Object], [Object],
  [Object], [Object],
  [Object], [Object],
  [Object], [Object],
  [Object], [Object],
  [Object], [Object]
],
  blockNumber: 6845196,
  confirmations: 1,
  cumulativeGasUsed: BigNumber { _hex: '0x040966', _isBigNumber: true },
effectiveGasPrice: BigNumber { _hex: '0x010c388cc1', _isBigNumber: true },
status: 1,
  type: 0,
  byzantium: true
}
]
*/
