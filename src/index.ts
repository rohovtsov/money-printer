import 'log-timestamp';
import { Contract, providers } from 'ethers';
import {
  concatMap,
  defer,
  delay,
  EMPTY,
  from,
  map,
  mergeMap,
  skip,
  switchMap,
  take,
  tap,
} from 'rxjs';
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
  ERC20_ABI,
  ETHER,
  EthMarket,
  EthMarketFactory,
  FLASHBOTS_RELAY_HACKED_SIGNING_KEY,
  FLASHBOTS_RELAY_SIGNING_KEY,
  getLastBlockNumber,
  INFURA_API_KEY,
  MIN_PROFIT_NET,
  MONEY_PRINTER_QUERY_ABI,
  MONEY_PRINTER_QUERY_ADDRESS,
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
import { UniswapV3PreSyncer } from './uniswap/uniswap-v3-pre-syncer';

const PROVIDERS = [
  new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.AlchemyProvider(NETWORK, ALCHEMY_API_KEY),
  new providers.InfuraWebSocketProvider(NETWORK, INFURA_API_KEY),
  new providers.InfuraProvider(NETWORK, INFURA_API_KEY),
];
const provider = PROVIDERS[0] as providers.WebSocketProvider;
const providerForLogs = PROVIDERS[1];
const providersForRace = PROVIDERS.filter((p) => p !== provider);

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  console.log(`Launching on ${NETWORK} ${USE_FLASHBOTS ? 'using flashbots ' : ''}...`);
  console.log(`Using ${providersForRace.length} providers for race requests...`);

  const sender = USE_FLASHBOTS
    ? await FlashbotsTransactionSender.create(
        provider,
        NETWORK,
        FLASHBOTS_RELAY_HACKED_SIGNING_KEY,
        FLASHBOTS_RELAY_SIGNING_KEY,
      )
    : new Web3TransactionSender(provider, 2);

  const LAST_BLOCK = await getLastBlockNumber(providerForLogs);
  const factories: EthMarketFactory[] = [
    ...UNISWAP_V2_FACTORY_ADDRESSES.map(
      (address) => new UniswapV2MarketFactory(providerForLogs, address, LAST_BLOCK),
    ),
    ...UNISWAP_V3_FACTORY_ADDRESSES.map(
      (address) => new UniswapV3MarketFactory(providerForLogs, address, LAST_BLOCK),
    ),
  ];

  const markets: EthMarket[] = (
    await Promise.all(factories.map((factory) => factory.getEthMarkets()))
  ).reduce((acc, markets) => [...acc, ...markets], []);

  console.log(`Loaded markets: ${markets.length}`);

  const blacklist = new ArbitrageBlacklist(BLACKLIST_MARKETS, BLACKLIST_TOKENS);
  const executor = new ArbitrageExecutor(sender, provider, PRIVATE_KEY);
  const allowedMarkets = blacklist.filterMarkets(markets);

  await new UniswapV3PreSyncer(
    new UniswapV3PoolStateSyncer(3),
    markets.filter((market) => market.protocol === 'uniswapV3') as UniswapV3Market[],
    true,
  ).presync();

  const runner = new ArbitrageRunner(
    allowedMarkets,
    [
      new TriangleArbitrageStrategy(
        {
          [WETH_ADDRESS]: [ETHER * 5n], //, ETHER.mul(10), ETHER]
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

  //грубый фильтр по minGasUsed
  let minGasUsed = 200000n;
  let maxProfitableBlocksCount = 5;
  let nonProfitableBlockCount = 0;
  //убыток составит gasFees / reduceEstimatedGasBy;
  let reduceEstimatedGasBy = 2n;

  const thisBlock$ = runner.currentBlockNumber$;
  const concurrentSimulationCount = 10;
  const opportunities$ = runner.start().pipe(
    //pause a bit, to let eventLoop deliver the new blocks
    delay(1),
    switchMap((event) => {
      let opportunities = event.opportunities.filter(
        (op) => op.profit - minGasUsed * event.baseFeePerGas >= MIN_PROFIT_NET,
      );
      console.log(
        `Found opportunities: ${opportunities.length} in ${endTime('render')}ms at ${
          event.blockNumber
        }`,
      );
      console.log(`Since block was received: ${Date.now() - event.blockReceivedAt}ms\n`);

      if (opportunities.length <= 0) {
        nonProfitableBlockCount++;
      } else {
        nonProfitableBlockCount = 0;
      }

      console.log(`Non profitable blocks passed: ${nonProfitableBlockCount}`);

      if (nonProfitableBlockCount >= maxProfitableBlocksCount) {
        opportunities = event.opportunities.filter(
          (op) =>
            op.profit - (minGasUsed / reduceEstimatedGasBy) * event.baseFeePerGas >= MIN_PROFIT_NET,
        );
        console.log(
          `Found opportunities: ${opportunities.length} in ${endTime('render')}ms at ${
            event.blockNumber
          }, with gas use reduced by ${reduceEstimatedGasBy}`,
        );

        return from(
          opportunities.map((op) => [op, event.baseFeePerGas] as [ArbitrageOpportunity, bigint]),
        );
      }

      return EMPTY;
    }),
  );

  const simulatedOpportunities$ = opportunities$.pipe(
    mergeMap(([opportunity, baseFeePerGas]) => {
      return thisBlock$.pipe(
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

          return defer(() =>
            executor.simulateOpportunity(opportunity, baseFeePerGas, reduceEstimatedGasBy),
          ).pipe(
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

  let lastExecutedAtBlock = 0;
  const executedOpportunities$ = simulatedOpportunities$.pipe(
    mergeMap((opportunity) => {
      return thisBlock$.pipe(
        concatMap((blockNumber) => {
          nonProfitableBlockCount = 0;

          if (blockNumber > opportunity.blockNumber) {
            console.log(
              `Execution postponed. Old block ${opportunity.blockNumber} / ${blockNumber}`,
            );
            //удачную оппортунити с чистой доходностью > 0, проверим на след блоке
            runner.queueOpportunity(opportunity);
            return EMPTY;
          }

          if (lastExecutedAtBlock >= opportunity.blockNumber) {
            console.log(
              `Execution postponed. Opportunity already sent at this block ${lastExecutedAtBlock}`,
            );
            //если уже на этом блоке отправляли, не будем усугублять так сказать
            runner.queueOpportunity(opportunity);
            return EMPTY;
          }

          console.log(`Executing opportunity...`);
          printOpportunity(opportunity);
          lastExecutedAtBlock = opportunity.blockNumber;

          return defer(() => executor.executeOpportunity(opportunity)).pipe(map(() => opportunity));
        }),
      );
    }),
  );

  executedOpportunities$.subscribe();
}

main();

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
