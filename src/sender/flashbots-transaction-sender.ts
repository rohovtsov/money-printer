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
  sleep,
  TransactionData,
  TransactionSender,
  TransactionSimulator,
} from '../entities';
import { GetBundleStatsResponseSuccess } from '@flashbots/ethers-provider-bundle/src';

const storePath = `simulations/${NETWORK}.json`;

const resolutionsMap: Record<FlashbotsBundleResolution, string> = {
  [FlashbotsBundleResolution.BundleIncluded]: 'BundleIncluded',
  [FlashbotsBundleResolution.AccountNonceTooHigh]: 'AccountNonceTooHigh',
  [FlashbotsBundleResolution.BlockPassedWithoutInclusion]: 'BlockPassedWithoutInclusion',
};

export class FlashbotsTransactionSender implements TransactionSender, TransactionSimulator {
  readonly type = 'flashbots';
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
    //TODO: rewrite bad error checking triggers
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
        throw transaction;
      }

      const hash = transaction!.bundleHash;
      console.log(
        `Flashbots transaction. Sent: ${hash} at ${blockNumber} - since block was received: ${
          Date.now() - data.opportunity.blockReceivedAt!
        }ms`,
      );
      const result = await transaction.wait();
      const receipt = ((await transaction.receipts()) ?? [])?.[0] ?? null;
      this.logResultReport(hash, data.opportunity, result, receipt, blockNumber);

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

      this.opportunityResults$.next({ opportunity: data.opportunity, result: true });
      return (estimatedGas * nominator) / denominator + 1n;
    } catch (e: any) {
      if (e?.code === 429) {
        console.log(`Simulation error.`, e?.message);
        await sleep(250);
        return this.simulateWithEstimate(data);
      }

      if (e?.message?.includes('execution reverted')) {
        this.opportunityResults$.next({ opportunity: data.opportunity, result: false });
      }

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
      console.log(`Flashbots ${hash}. User stats:`, await this.flashbotsProvider.getUserStats());

      /*//TODO: this call affects reputation https://docs.flashbots.net/flashbots-auction/searchers/advanced/troubleshooting#detecting
      console.log(
        `Flashbots ${hash}. Conflicting bundles:`,
        await this.flashbotsProvider.getConflictingBundle(signedBundle, blocKNumber),
      );*/
    } catch (err) {
      console.log(`Flashbots ${hash} Error while getting stats.`, err);
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
    newSigningKeyPerEachRequest?: boolean,
    signingKey?: Address,
  ): Promise<FlashbotsTransactionSender> {
    return new FlashbotsTransactionSender(
      await createFlashbotsBundleProvider(
        provider,
        network,
        newSigningKeyPerEachRequest,
        signingKey,
      ),
      provider,
    );
  }
}
