import { BigNumber, providers, Wallet } from "ethers";
import { Observable } from 'rxjs';
import { Listener } from '@ethersproject/providers';

export const ETHER = BigNumber.from(10).pow(18);
export const GWEI = BigNumber.from(10).pow(9);

export function bigNumberToDecimal(value: BigNumber, base = 18): number {
  const divisor = BigNumber.from(10).pow(base)
  return value.mul(10000).div(divisor).toNumber() / 10000
}

export function getDefaultRelaySigningKey(): string {
  console.warn("You have not specified an explicity FLASHBOTS_RELAY_SIGNING_KEY environment variable. Creating random signing key, this searcher will not be building a reputation for next run")
  return Wallet.createRandom().privateKey;
}

export function fromProviderEvent<T = unknown>(provider: providers.JsonRpcProvider, eventName: string): Observable<T> {
  return new Observable((observer) => {
    const listener: Listener = (data) => {
      observer.next(data);
    };

    provider.on(eventName, listener);

    return () => {
      provider.off(eventName, listener);
      observer.complete();
    }
  });
}

export function splitIntoBatches<T = any>(array: T[], batchSize: number): T[][] {
  const batchCount = Math.ceil(array.length / batchSize);

  return Array.from({ length: batchCount })
    .map((_, i) => array.slice(i * batchSize, Math.min(((i + 1) * batchSize), array.length)));
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
