import { getLogsRegressive, LogsPack, LogsRequestOptions, mergeLogPacks } from './logs-requester';
import { providers, utils } from 'ethers';
import fs from 'fs';
import { NETWORK } from './environmet';
import { lastValueFrom } from 'rxjs';

type LogsCacheRequestOptions = Omit<Omit<LogsRequestOptions, 'fromBlock'>, 'toBlock'>;

export class LogsCache {
  private readonly cachePath;
  private readonly cacheHash;
  private readonly cacheNetwork;
  private readonly options: LogsCacheRequestOptions;

  constructor(
    private readonly provider: providers.JsonRpcProvider,
    options: LogsCacheRequestOptions,
  ) {
    this.options = options;
    this.cacheNetwork = NETWORK;
    this.cacheHash = utils.keccak256(utils.toUtf8Bytes(JSON.stringify(this.options)));
    this.cachePath = `./cache/logs-cache/${this.cacheNetwork}.${this.cacheHash}.json`;
  }

  async getLogsRegressive(toBlock: number): Promise<LogsPack> {
    const cachedPack = this.getLogs();
    let pack: LogsPack;

    if (cachedPack) {
      const lastBlockNumberInCache = cachedPack.logs.reduce(
        (acc, log) => Math.max(acc, log.blockNumber),
        0,
      );
      pack = {
        ...cachedPack,
        logs: cachedPack.logs.filter((log) => log.blockNumber <= toBlock),
      };
      const fromBlock = lastBlockNumberInCache + 1;

      console.log(`Logs retrieved from cache: 0 - ${lastBlockNumberInCache}`);

      if (fromBlock <= toBlock) {
        const restPack = await this.getRestLogsRegressive(fromBlock, toBlock);
        pack = {
          fromId: Math.min(pack.fromId, restPack.fromId),
          toId: Math.max(pack.toId, restPack.toId),
          logs: [...pack.logs, ...restPack.logs],
        };
      }
    } else {
      pack = await this.getRestLogsRegressive(0, toBlock);
    }

    this.writeLogs(pack);

    return pack;
  }

  private async getRestLogsRegressive(fromBlock: number, toBlock: number): Promise<LogsPack> {
    return lastValueFrom(
      getLogsRegressive(this.provider, {
        ...this.options,
        fromBlock,
        toBlock,
      }).pipe(mergeLogPacks()),
    );
  }

  getLogs(): LogsPack | null {
    if (!fs.existsSync(this.cachePath)) {
      return null;
    }

    const data: string = fs.readFileSync(this.cachePath).toString();

    if (data) {
      return JSON.parse(data) as LogsPack;
    }

    return null;
  }

  writeLogs(pack: LogsPack): void {
    fs.mkdirSync('./cache/logs-cache/', { recursive: true });
    fs.writeFileSync(this.cachePath, JSON.stringify(pack, null, 2));
  }
}
