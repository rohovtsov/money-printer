import 'log-timestamp';
import { concatMap, defer, delay, EMPTY, from, map, mergeMap, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageExecutor } from './arbitrage-executor';
import { ArbitrageRunner } from './arbitrage-runner';
import {
  ArbitrageOpportunity,
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  FLASHBOTS_RELAY_HACKED_SIGNING_KEY,
  FLASHBOTS_RELAY_SIGNING_KEY,
  getLastBlockNumber,
  getProvider,
  MIN_PROFIT_NET,
  NETWORK,
  printOpportunity,
  PRIVATE_KEY,
  SimulatedArbitrageOpportunity,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES,
  USE_FLASHBOTS,
  WETH_ADDRESS,
} from './entities';
import { FlashbotsTransactionSender } from './sender/flashbots-transaction-sender';
import { Web3TransactionSender } from './sender/web3-transaction-sender';
import { FixedAmountArbitrageStrategy } from './strategies/fixed-amount-arbitrage-strategy';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { UniswapV3PoolStateSyncerContractQuery } from './uniswap/uniswap-v3-pool-state-syncer-contract-query';
import { UniswapV2ArbitrageStrategy } from './strategies/uniswap-v2-arbitrage-strategy';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { UniswapV3PreSyncer } from './uniswap/uniswap-v3-pre-syncer';

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  console.log(`Launching on ${NETWORK} ${USE_FLASHBOTS ? 'using flashbots ' : ''}...`);

  const provider = getProvider('main purpose');
  const providerForLogs = getProvider('requesting logs', ['CUSTOM_WS']);

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
      new FixedAmountArbitrageStrategy(
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
  );

  const thisBlock$ = runner.currentBlockNumber$;
  const concurrentSimulationCount = 10;
  const opportunities$ = runner.start().pipe(
    //pause a bit, to let eventLoop deliver the new blocks
    delay(1),
    switchMap((event) => {
      const opportunities = event.opportunities.filter(
        (op) => op.profit - 200000n * event.baseFeePerGas >= MIN_PROFIT_NET,
      );
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

  let lastExecutedAtBlock = 0;
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
