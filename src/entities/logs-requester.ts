import { concat, Observable, reduce, Subject, Subscription, throwError } from "rxjs";
import { catchError, map, retry, takeUntil } from "rxjs/operators";
import { providers } from 'ethers';


const isDefined = (value: any): boolean => {
  return value !== null && value !== undefined;
};


export interface Log {
  address: string;
  data: string;
  topics: string[];
  logIndex: number;
  transactionIndex: number;
  transactionHash: string;
  blockHash: string;
  blockNumber: number;
}


export interface LogsPack {
  fromId: number;
  toId: number;
  logs: Log[];
}


export interface LogsRequestOptions {
  fromBlock: number;
  toBlock: number;
  topics?: string[];
  address?: string;
  reverseOrder?: boolean;
}


const parseBlockPointer = (pointer: number|string): string => {
  if (typeof pointer === 'number') {
    return '0x' + pointer.toString(16);
  } else {
    return pointer;
  }
};

export function mergeLogPacks() {
  return function (source: Observable<LogsPack>): Observable<LogsPack> {
    return source.pipe(
      reduce((acc, pack) => {
        acc.fromId = Math.min(pack.fromId, acc.fromId);
        acc.toId = Math.max(pack.toId, acc.toId);
        acc.logs.push(...pack.logs);
        return acc;
      }, { fromId: 0, toId: 0, logs: [] } as LogsPack),
    );
  }
}

const getLogs = (
  provider: providers.JsonRpcProvider,
  fromBlock: string | number,
  toBlock: string | number = fromBlock,
  topics: string[] | undefined = undefined,
  address: string | undefined = undefined
): Observable<Log[]> => {
  return new Observable<Log[]>((subscriber) => {
    console.log('Request: ' + fromBlock + ' - ' + toBlock);

    provider.getLogs({
      fromBlock: parseBlockPointer(fromBlock),
      toBlock: parseBlockPointer(toBlock),
      topics: topics ?? undefined,
      address: address ?? undefined
    })
      .then((logs: Log[]) => {
        subscriber.next(logs);
        subscriber.complete();
      })
      .catch(subscriber.error.bind(subscriber));
  });
};



const getAllLogsRegressive = (
  provider: providers.JsonRpcProvider,
  fromBlock: number,
  toBlock: number,
  topics: string[] | undefined = undefined,
  address: string | undefined = undefined,
  reverseOrder: boolean | undefined = undefined,
): Observable<LogsPack> => {
  const isReversedOrder = reverseOrder ?? false;

  return getLogs(provider, fromBlock, toBlock, topics, address).pipe(
    map((logs): LogsPack => {
      return {
        logs,
        fromId: fromBlock,
        toId: toBlock
      }
    }),
    catchError(err => {
      //-32000 invalid from and to
      //-32602 out of range
      const errorCode = JSON.parse(err?.body || '{}')?.error?.code;

      if (!isDefined(errorCode)) {
        return throwError(err);
      } else if (errorCode !== -32005) {
        return throwError(err);
      }

      const count = toBlock - fromBlock + 1;
      const newCount = Math.ceil(count / 2);

      const fromBlock1 = fromBlock;
      const toBlock1 = Math.min(fromBlock + newCount, toBlock);
      const fromBlock2 = Math.min(toBlock1 + 1, toBlock);
      const toBlock2 = Math.min(fromBlock2 + newCount, toBlock);

      if (
        (newCount < 0 || fromBlock2 > toBlock2 || fromBlock1 > toBlock1) ||
        (fromBlock1 === fromBlock && toBlock1 === toBlock) ||
        (fromBlock2 === fromBlock && toBlock2 === toBlock)
      ) {
        return throwError({
          code: -228,
          message: 'Insufficient range requested'
        });
      }

      const firstHalf$ = getAllLogsRegressive(provider, fromBlock1, toBlock1, topics, address, reverseOrder);
      const secondHalf$ = getAllLogsRegressive(provider, fromBlock2, toBlock2, topics, address, reverseOrder);
      const request1$ = isReversedOrder ? secondHalf$ : firstHalf$;
      const request2$ = isReversedOrder ? firstHalf$ : secondHalf$;

      return concat(
        request1$,
        request2$
      );
    }),
    retry(5)
  );
};


export const getLogsRegressive = (provider: providers.JsonRpcProvider, options: LogsRequestOptions): Observable<LogsPack> => {
  if (!isDefined(provider) || !isDefined(options.fromBlock) || !isDefined(options.toBlock)) {
    return throwError({ message: 'Not enough options' });
  }

  return new Observable<LogsPack>(observer => {
    let subscription: Subscription | null = null;
    let stopTaking = new Subject<void>();

    const stop = () => {
      subscription?.unsubscribe();
      stopTaking.next();
    };

    subscription = getAllLogsRegressive(provider, options.fromBlock, options.toBlock, options.topics, options.address, options.reverseOrder).pipe(
      takeUntil(stopTaking)
    ).subscribe({
      next(logs) {
        observer.next(logs);
      },
      complete() {
        observer.complete();
        stop();
      },
      error(err) {
        observer.error(err);
      }
    });

    return stop;
  });
};
