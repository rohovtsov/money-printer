import { providers } from 'ethers';
import { concatMap, delay, Observable, of, OperatorFunction } from 'rxjs';
import { Listener } from '@ethersproject/providers';
import { NETWORK } from './environmet';
import { Log, Filter } from '@ethersproject/abstract-provider';

export const ETHER = 10n ** 18n;
export const GWEI = 10n ** 9n;

export function bigIntToDecimal(value: bigint, base = 18): number {
  return Number(value.toString()) / 10 ** base;
}

export function bigIntAbs(a: bigint): bigint {
  return a >= 0 ? a : -a;
}

export function bigIntSqrt(value: bigint): bigint {
  if (value < 0n) {
    throw 'square root of negative numbers is not supported';
  }

  if (value < 2n) {
    return value;
  }

  /*
  function newtonIteration(n: bigint, x0: bigint): bigint {
    const x1 = ((n / x0) + x0) >> 1n;
    if (x0 === x1 || x0 === (x1 - 1n)) {
      return x0;
    }
    return newtonIteration(n, x1);
  }

  return newtonIteration(value, 1n);*/

  let n = value;
  let x0 = 1n;
  let x1;

  do {
    x1 = (n / x0 + x0) >> 1n;

    if (x0 === x1 || x0 === x1 - 1n) {
      return x0;
    }

    x0 = x1;
  } while (true);
}

export function bigIntSqrtFast(A: bigint, n: bigint): bigint {
  //"rounding" parameter
  //can be a strings:
  //1. 'floor', undefined, or another other value - by default...
  //2. 'ceil' - up rounding
  //3. 'round' - rounding to nearest integer.

  //Code from here: https://github.com/peterolson/BigInteger.js/issues/146
  //I already have integer logarithm function here
  function ilog2(n: bigint): bigint {
    // n is a positive non-zero BigInt
    const C1 = BigInt(1);
    const C2 = BigInt(2);
    var count: bigint = 0n;
    for (; n > C1; count++) n = n / C2;
    return count;
  }

  // https://stackoverflow.com/questions/15978781/how-to-find-integer-nth-roots
  // @ts-ignore
  var nthRoot = function (A: bigint, n: bigint, e: bigint): bigint {
    if (e < n) {
      return 1n;
    }
    var q = e / n / 2n;
    var t = 2n ** q;
    var x0 = q === 0n ? 4n : (t + 1n) * nthRoot(A / t ** n, n, e - q * n);
    var x = x0;
    var xp = x + 1n;
    while (x < xp) {
      xp = x;
      var t = A / x ** (n - 1n);
      x = (x * (n - 1n) + t) / n;
    }
    return xp;
  };
  if (A < 0 || n <= 0) {
    throw new RangeError();
  }
  if (A === 0n) {
    return 0n;
  }
  var e = ilog2(A);
  var x = nthRoot(A, n, e);
  /*

  if(typeof rounding !== 'undefined'){
    if(rounding === 'ceil'){
      return x.next();
    }
    else if(rounding === 'round'){
      //10 n√x = n√(10^n)x;
      //(n√(10^n)x % 10 >= 5) ? n_root++ : n_root;
      var n10 = bigInt('10').pow(n);
      var An10 = A.multiply(n10);
      var n_root_An10 = An10.nthRoot(n);
      var last_digit = n_root_An10.mod(bigInt('10'));
      if(last_digit.geq(bigInt('5'))){return x.next()}
      //else return default floor.
    }
    //else return default floor
  }//else return default floor
*/

  return x;
  //if x not a whole root, and A not a x.pow(m), you can calculate difference yourself.
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
): Promise<bigint> {
  //TODO: maybe getBlock("pending") takes more time to request???
  const block = await provider.getBlock('pending');

  if (block.baseFeePerGas && block.number > blockNumber) {
    return block.baseFeePerGas.toBigInt();
  } else if (block.baseFeePerGas) {
    return await getBaseFeePerGas(provider, blockNumber);
  }

  //Fallback is baseFeePerGas is not supported by chain
  return provider.getGasPrice().then((gas) => {
    //12.5% (~ 13%) = is max base gas price increase per next block
    return (gas.toBigInt() * 113n) / 100n;
  });
}

export async function getLastBlockNumber(provider: providers.JsonRpcProvider): Promise<number> {
  //TODO: maybe getBlock("pending") takes more time to request???
  const block = await provider.getBlock('latest');

  return block.number;
}

export function bigNumberMax(a: bigint, b: bigint): bigint {
  if (a >= b) {
    return a;
  } else {
    return b;
  }
}

export function canCalcBaseFeePerGas(blockNumber: number): boolean {
  //London block number 12965000 for mainnet
  return (
    (NETWORK === 'mainnet' && blockNumber >= 12965000) ||
    (NETWORK === 'goerli' && blockNumber >= 6890000)
  );
}

export function calcBaseFeePerGas(
  baseFeePerGas: bigint,
  gasUsed: bigint,
  gasLimit: bigint,
): bigint {
  const BASE_FEE_MAX_CHANGE_DENOMINATOR = 8n;
  const ELASTICITY_MULTIPLIER = 2n;

  const parentGasTarget = gasLimit / ELASTICITY_MULTIPLIER;
  const parentGasTargetBig = parentGasTarget;
  const baseFeeChangeDenominator = BASE_FEE_MAX_CHANGE_DENOMINATOR;

  // If the parent gasUsed is the same as the target, the baseFee remains unchanged.
  if (gasUsed === parentGasTarget) {
    return baseFeePerGas;
  }

  if (gasUsed > parentGasTarget) {
    // If the parent block used more gas than its target, the baseFee should increase.
    const gasUsedDelta = gasUsed - parentGasTarget;
    const x = baseFeePerGas * gasUsedDelta;
    const y = x / parentGasTargetBig;
    const baseFeeDelta = bigNumberMax(y / baseFeeChangeDenominator, 1n);

    return baseFeePerGas + baseFeeDelta;
  } else {
    // Otherwise if the parent block used less gas than its target, the baseFee should decrease.
    const gasUsedDelta = parentGasTarget - gasUsed;
    const x = baseFeePerGas * gasUsedDelta;
    const y = x / parentGasTargetBig;
    const baseFeeDelta = y / baseFeeChangeDenominator;

    return bigNumberMax(baseFeePerGas - baseFeeDelta, 0n);
  }
}

async function getNonEmptyLogsRecursive(
  provider: providers.JsonRpcProvider,
  payload: Filter,
  maxRetries: number,
  retryNumber = 0,
): Promise<Log[]> {
  let logs = await provider.getLogs(payload).catch(() => []);

  if (logs.length <= 0 && retryNumber < maxRetries) {
    return getNonEmptyLogsRecursive(provider, payload, maxRetries, retryNumber + 1);
  } else {
    return logs;
  }
}

export async function raceGetLogs(
  provider: providers.JsonRpcProvider,
  otherProviders: providers.JsonRpcProvider[],
  payload: Filter,
): Promise<Log[]> {
  return Promise.race([
    provider.getLogs(payload),
    ...otherProviders.map((otherProvider) => getNonEmptyLogsRecursive(otherProvider, payload, 100)),
  ]);
}
