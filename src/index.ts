import 'log-timestamp';
import { providers } from 'ethers';
import { concatMap, defer, delay, EMPTY, from, map, mergeMap, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageExecutor } from './arbitrage-executor';
import { ArbitrageRunner } from './arbitrage-runner';
import {
  ALCHEMY_API_KEY,
  ArbitrageOpportunity,
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  FLASHBOTS_RELAY_SIGNING_KEY,
  getLastBlockNumber,
  INFURA_API_KEY,
  MIN_PROFIT_NET,
  NETWORK,
  printOpportunity,
  PRIVATE_KEY,
  SimulatedArbitrageOpportunity,
  startTime,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES,
  USE_FLASHBOTS,
  WETH_ADDRESS,
} from './entities';
import { FlashbotsTransactionSender } from './sender/flashbots-transaction-sender';
import { Web3TransactionSender } from './sender/web3-transaction-sender';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { UniswapV3PoolStateSyncerContractQuery } from './uniswap/uniswap-v3-pool-state-syncer-contract-query';
import { UniswapV2ArbitrageStrategy } from './triangle/uniswap-v2-arbitrage-strategy';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';

const PROVIDERS = [
  new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.AlchemyProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.InfuraWebSocketProvider(NETWORK, INFURA_API_KEY),
  new providers.InfuraProvider(NETWORK, INFURA_API_KEY),
];
const provider = PROVIDERS[0] as providers.WebSocketProvider;
const providersForRace = PROVIDERS.filter((p) => p !== provider);

async function testSpeed() {
  const test = [
    [PROVIDERS[0], 'WS Alchemy'],
    [PROVIDERS[1], 'Alchemy'],
    [PROVIDERS[2], 'WS Infura'],
    [PROVIDERS[3], 'Infura'],
  ];

  const blocks: Record<string, any[]> = {};
  const timestamps: Record<string, any> = {};

  for (const item of test) {
    (item[0] as any).on('block', (num: number) => {
      const arr = blocks[String(num)] ?? (blocks[String(num)] = []);
      const now = Date.now();

      if (!timestamps[String(num)]) {
        timestamps[String(num)] = now;
      }

      const first = timestamps[String(num)];
      arr.push([item[1], now - first]);

      console.log(blocks);
    });
  }
}

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  console.log(`Launching on ${NETWORK} ${USE_FLASHBOTS ? 'using flashbots ' : ''}...`);
  console.log(`Using ${providersForRace.length} providers for race requests...`);

  const sender = USE_FLASHBOTS
    ? await FlashbotsTransactionSender.create(provider, NETWORK, FLASHBOTS_RELAY_SIGNING_KEY)
    : new Web3TransactionSender(provider, 2);

  const LAST_BLOCK = await getLastBlockNumber(provider);
  const factories: EthMarketFactory[] = [
    ...UNISWAP_V2_FACTORY_ADDRESSES.map(
      (address) => new UniswapV2MarketFactory(provider, address, LAST_BLOCK),
    ),
    ...UNISWAP_V3_FACTORY_ADDRESSES.map(
      (address) => new UniswapV3MarketFactory(provider, address, LAST_BLOCK),
    ),
  ];

  const markets: EthMarket[] = (
    await Promise.all(factories.map((factory) => factory.getEthMarkets()))
  ).reduce((acc, markets) => [...acc, ...markets], []);

  console.log(`Loaded markets: ${markets.length}`);

  const blacklist = new ArbitrageBlacklist(BLACKLIST_MARKETS, BLACKLIST_TOKENS);
  const executor = new ArbitrageExecutor(sender, provider, PRIVATE_KEY);
  const allowedMarkets = blacklist.filterMarkets(markets);

  const syncerV3 = new UniswapV3PoolStateSyncer(provider, 3);
  let marketsV3 = markets.filter((market) => market.protocol === 'uniswapV3') as UniswapV3Market[];
  startTime('presyncV3');
  console.log(`Pre-Sync v3 markets: ${marketsV3.length} ...`);
  await syncerV3.syncPoolStates(marketsV3, 0);
  console.log(`Pre-Sync v3 markets: ${marketsV3.length} finished in ${endTime('presyncV3')}ms`);

  const runner = new ArbitrageRunner(
    allowedMarkets,
    [
      new TriangleArbitrageStrategy(
        {
          [WETH_ADDRESS]: [ETHER * 13n], //, ETHER.mul(10), ETHER]
        },
        allowedMarkets,
      ),
      new UniswapV2ArbitrageStrategy({ startAddresses: [WETH_ADDRESS] }, allowedMarkets),
    ],
    new UniswapV2ReservesSyncer(provider, 10, 1000),
    new UniswapV3PoolStateSyncerContractQuery(provider, 10),
    provider,
    providersForRace,
  );

  const thisBlock$ = runner.currentBlockNumber$;
  const concurrentSimulationCount = 20;
  const opportunities$ = runner.start().pipe(
    //pause a bit, to let eventLoop deliver the new blocks
    delay(1),
    switchMap((event) => {
      const opportunities = event.opportunities.filter((op) => op.profit > MIN_PROFIT_NET);
      console.log(
        `Found opportunities: ${opportunities.length} in ${endTime('render')}ms at ${
          event.blockNumber
        }`,
      );
      console.log(`Since block was received: ${Date.now() - event.blockReceivedAt}ms\n`);

      return from(
        opportunities.map((op) => [op, event.baseFeePerGas] as [ArbitrageOpportunity, bigint]),
      );
    }),
  );

  const simulatedOpportunities$ = opportunities$.pipe(
    mergeMap(([opportunity, baseFeePerGas]) => {
      return thisBlock$.pipe(
        //TODO: add timeout 60 sec for simulation
        concatMap((blockNumber) => {
          if (blockNumber > opportunity.blockNumber) {
            //если блок уже неактуальный, откладываем все до лучших времен.
            console.log(
              `Simulation postponed. Old block ${opportunity.blockNumber} / ${blockNumber}`,
            );
            runner.queueOpportunity(opportunity);
            return EMPTY;
          }

          console.log(`Simulation started. On ${blockNumber}`);

          return defer(() => executor.simulateOpportunity(opportunity, baseFeePerGas)).pipe(
            catchError((err: any) => {
              //если отвалилось иза-за неправильного газа, проверим на след. блоке
              if (err?.queue) {
                runner.queueOpportunity(opportunity);
              }

              //если закончились деньги - погибаем
              if (err?.die) {
                throw new Error('Insufficient funds');
              }

              return EMPTY;
            }),
            tap((opportunity: SimulatedArbitrageOpportunity) => {
              //удачную оппортунити с чистой доходностью > 0, проверим на след блоке
              runner.queueOpportunity(opportunity);
            }),
          );
        }),
      );
    }, concurrentSimulationCount),
  );

  const executedOpportunities$ = simulatedOpportunities$.pipe(
    mergeMap((opportunity) => {
      return thisBlock$.pipe(
        concatMap((blockNumber) => {
          if (blockNumber > opportunity.blockNumber) {
            console.log(
              `Execution postponed. Old block ${opportunity.blockNumber} / ${blockNumber}`,
            );
            //удачную оппортунити с чистой доходностью > 0, проверим на след блоке
            runner.queueOpportunity(opportunity);
            return EMPTY;
          }

          console.log(`Executing opportunity...`);
          printOpportunity(opportunity);
          return defer(() => executor.executeOpportunity(opportunity)).pipe(
            catchError(() => EMPTY),
            map(() => opportunity),
          );
        }),
      );
    }),
  );

  executedOpportunities$.subscribe();
}

main();
//testSpeed();

//16:09:06.934
//16:09:09.54
//16:09:10.63
//16:09:23.211Z

//16:13:21.69
//16:13:24.47
//16:13:26.78
//16:13:27.182Z

//16:16:51.317Z
//16:16:54.257Z
//16:16:54.748
//16:16:55.126Z

//22:17:05.532 - Получили блок
//22:17:07.752 - Получили измененные рынки
//22:17:08.491 - Закончили синхронится
//22:17:08.491 - Changed markets: 109 in 14782544
//22:17:08.494 - Changed triangles 52176
//22:17:09.790 - Changed triangles 22334
//22:17:13.268 - Found opportunities: 71, non-correlating: 71 in 4777ms
//22:17:13.268 - Передали на симуляция
//22:17:13.268 - Передали на симуляция
//22:17:13.902 - Пришла симуляция
//22:17:13.903 - Передали на отправку
//22:17:14.406 - Отправлено
//Итого - 9 сек
//22:17:30.248 - Новый блок (спустя 16 сек)
