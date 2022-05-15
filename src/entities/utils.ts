import { BigNumber, providers } from 'ethers';
import { concatMap, delay, Observable, of, OperatorFunction } from 'rxjs';
import { Listener } from '@ethersproject/providers';
import { NETWORK } from './environmet';

export const ETHER = BigNumber.from(10).pow(18);
export const GWEI = BigNumber.from(10).pow(9);

export function bigNumberToDecimal(value: BigNumber, base = 18): number {
  return Number(value.toString()) / 10 ** base;
}

export function fromProviderEvent<T = unknown>(
  provider: providers.JsonRpcProvider,
  eventName: string,
): Observable<T> {
  return new Observable((observer) => {
    const listener: Listener = (data) => {
      observer.next(data);
    };

    provider.on(eventName, listener);

    return () => {
      provider.off(eventName, listener);
      observer.complete();
    };
  });
}

export function splitIntoBatches<T = any>(array: T[], batchSize: number): T[][] {
  const batchCount = Math.ceil(array.length / batchSize);

  return Array.from({ length: batchCount }).map((_, i) =>
    array.slice(i * batchSize, Math.min((i + 1) * batchSize, array.length)),
  );
}

const TIMERS: Record<string, number> = {};

export function startTime(slug: string = 'default'): void {
  TIMERS[slug] = Date.now();
}

export function endTime(slug: string = 'default'): number {
  const now = Date.now();
  const res = now - (TIMERS[slug] ?? now);
  TIMERS[slug] = Date.now();
  return res;
}

export function rateLimit<T = unknown>(emitsPerSecond: number): OperatorFunction<T, T> {
  const requestsDelay = Math.ceil(1000 / emitsPerSecond);

  return (source: Observable<T>): Observable<T> => {
    return source.pipe(
      concatMap((opportunity) => {
        return of(opportunity).pipe(delay(requestsDelay));
      }),
    );
  };
}

export async function sleep(delay: number): Promise<void> {
  if (delay > 0) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export async function getBaseFeePerGas(
  provider: providers.JsonRpcProvider,
  blockNumber: number,
): Promise<BigNumber> {
  //TODO: maybe getBlock("pending") takes more time to request???
  const block = await provider.getBlock('pending');

  if (block.baseFeePerGas && block.number > blockNumber) {
    return block.baseFeePerGas;
  } else if (block.baseFeePerGas) {
    return await getBaseFeePerGas(provider, blockNumber);
  }

  //Fallback is baseFeePerGas is not supported by chain
  return provider.getGasPrice().then((gas) => {
    //12.5% (~ 13%) = is max base gas price increase per next block
    return gas.mul(113).div(100);
  });
}

export async function getLastBlockNumber(provider: providers.JsonRpcProvider): Promise<number> {
  //TODO: maybe getBlock("pending") takes more time to request???
  const block = await provider.getBlock('latest');

  return block.number;
}

export function bigNumberMax(a: BigNumber, b: BigNumber): BigNumber {
  if (a.gte(b)) {
    return a;
  } else {
    return b;
  }
}

export function canCalcBaseFeePerGas(blockNumber: number): boolean {
  //London block number 12965000 for mainnet
  return NETWORK === 'mainnet' && blockNumber >= 12965000;
}

export function calcBaseFeePerGas(
  baseFeePerGas: BigNumber,
  gasUsed: BigNumber,
  gasLimit: BigNumber,
): BigNumber {
  const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8;
  const ELASTICITY_MULTIPLIER = 2;

  const parentGasTarget = gasLimit.div(ELASTICITY_MULTIPLIER);
  const parentGasTargetBig = parentGasTarget;
  const baseFeeChangeDenominator = BigNumber.from(BASE_FEE_MAX_CHANGE_DENOMINATOR);

  // If the parent gasUsed is the same as the target, the baseFee remains unchanged.
  if (gasUsed.eq(parentGasTarget)) {
    return baseFeePerGas;
  }

  if (gasUsed.gt(parentGasTarget)) {
    // If the parent block used more gas than its target, the baseFee should increase.
    const gasUsedDelta = gasUsed.sub(parentGasTarget);
    const x = baseFeePerGas.mul(gasUsedDelta);
    const y = x.div(parentGasTargetBig);
    const baseFeeDelta = bigNumberMax(y.div(baseFeeChangeDenominator), BigNumber.from(1));

    return baseFeePerGas.add(baseFeeDelta);
  } else {
    // Otherwise if the parent block used less gas than its target, the baseFee should decrease.
    const gasUsedDelta = parentGasTarget.sub(gasUsed);
    const x = baseFeePerGas.mul(gasUsedDelta);
    const y = x.div(parentGasTargetBig);
    const baseFeeDelta = y.div(baseFeeChangeDenominator);

    return bigNumberMax(baseFeePerGas.sub(baseFeeDelta), BigNumber.from(0));
  }
}
