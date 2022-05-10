import { TransactionReceipt } from '@ethersproject/abstract-provider/src.ts';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { BigNumber, providers } from 'ethers';
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import { concatMap, Subject } from 'rxjs';
import {
  Address,
  ArbitrageOpportunity,
  bigNumberToDecimal,
  createFlashbotsBundleProvider,
  MINER_REWORD_PERCENT,
  NETWORK,
  SimulatedArbitrageOpportunity,
  sleep,
  TransactionData,
  TransactionSender,
} from '../entities';

const storePath = `simulations/${NETWORK}.json`;

export class FlashbotsTransactionSender implements TransactionSender {
  private opportunityResults$ = new Subject<{
    opportunity: ArbitrageOpportunity;
    result: boolean;
  }>();
  private map = JSON.parse(readFileSync(storePath, { encoding: 'utf8' }));
  private rateLimitedTill = 0;

  constructor(readonly flashbotsProvider: FlashbotsBundleProvider) {
    this.opportunityStore();
  }

  async sendTransaction(data: TransactionData): Promise<TransactionReceipt | null> {
    const delay = Math.max(this.rateLimitedTill ? this.rateLimitedTill - Date.now() : 0, 0);

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
      const result = await this.flashbotsProvider.sendRawBundle(signedBundle, blockNumber);

      if ('error' in result) {
        console.log(result);
        throw new Error('Relay Error');
      }

      await result.wait();
      const receipts = (await result.receipts()) ?? [];
      return receipts?.[0] ?? null;
    } catch (err: any) {
      const ratelimitResetAt = Number(err?.headers?.['x-ratelimit-reset']) * 1000;

      if (ratelimitResetAt && !isNaN(ratelimitResetAt)) {
        this.rateLimitedTill = Math.max(this.rateLimitedTill, ratelimitResetAt);
        console.log(
          `Transaction send rate limited. Wake up in ${this.rateLimitedTill - Date.now()}ms`,
        );
        return this.sendTransaction(data);
      } else {
        throw err;
      }
    }
  }

  async simulateTransaction(data: TransactionData): Promise<BigNumber> {
    const { signer, transactionData, blockNumber } = data;

    const signedBundle = await this.flashbotsProvider.signBundle([
      {
        signer: signer,
        transaction: transactionData,
      },
    ]);

    const simulation = await this.flashbotsProvider.simulate(signedBundle, blockNumber);

    if ('error' in simulation || simulation.firstRevert !== undefined) {
      this.opportunityResults$.next({ opportunity: data.opportunity, result: false });
      /*// @ts-ignore
      console.log('Simulation error: ', simulation?.firstRevert?.revert, simulation.error);*/
      throw simulation;
    }

    this.opportunityResults$.next({ opportunity: data.opportunity, result: true });

    /*const opportunity = data.opportunity;
    const gasPrice = data.transactionData?.gasPrice ?? BigNumber.from(0);
    const gasUsed = BigNumber.from(simulation.totalGasUsed);
    const gasFees = gasUsed.mul(gasPrice);
    const coinbaseDiff = simulation.coinbaseDiff;
    const profitNet = opportunity.profit.sub(coinbaseDiff).sub(gasFees);

    console.log(
      `Simulation ${profitNet.gt(BigNumber.from(0)) ? 'successful' : 'unprofitable'}: ` +
        `profitNet: ${bigNumberToDecimal(profitNet, 18)} ` +
        `profitGross: ${bigNumberToDecimal(data.opportunity.profit, 18)}, ` +
        `coinbase: ${bigNumberToDecimal(coinbaseDiff, 18)}, ` +
        `gasFees: ${bigNumberToDecimal(gasFees, 18)}, ` +
        `- at block: ${blockNumber}`,
    );*/

    return BigNumber.from(simulation.totalGasUsed);
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
