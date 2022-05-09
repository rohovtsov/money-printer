import { BigNumber, providers, Wallet } from 'ethers';
import { concatMap, delay, Observable, of, OperatorFunction } from 'rxjs';
import { Listener } from '@ethersproject/providers';
import { SimulatedArbitrageOpportunity } from './interfaces/arbitrage-execution';

export const ETHER = BigNumber.from(10).pow(18);
export const GWEI = BigNumber.from(10).pow(9);

export function bigNumberToDecimal(value: BigNumber, base = 18): number {
  const divisor = BigNumber.from(10).pow(base);
  return value.mul(10000).div(divisor).toNumber() / 10000;
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
