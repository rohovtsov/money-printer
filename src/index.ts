import 'log-timestamp';
import { BigNumber, Contract, providers } from 'ethers';
import {
  concatMap,
  defer,
  EMPTY,
  filter,
  map,
  merge,
  mergeMap,
  shareReplay,
  switchMap,
  take,
  tap,
} from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageExecutor } from './arbitrage-executor';
import { ArbitrageRunner } from './arbitrage-runner';
import {
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  FLASHBOTS_RELAY_SIGNING_KEY,
  getBaseFeePerGas,
  getLastBlockNumber,
  getLogsRegressive,
  INFURA_API_KEY,
  mergeLogPacks,
  NETWORK,
  printOpportunity,
  PRIVATE_KEY,
  SimulatedArbitrageOpportunity,
  startTime,
  UNISWAP_POOL_BURN_EVENT_TOPIC,
  UNISWAP_POOL_MINT_EVENT_TOPIC,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES,
  UNISWAP_V3_POOL_ABI,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  USE_FLASHBOTS,
  WETH_ADDRESS,
} from './entities';
import { FlashbotsTransactionSender } from './sender/flashbots-transaction-sender';
import { Web3TransactionSender } from './sender/web3-transaction-sender';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { UniswapV2ArbitrageStrategy } from './triangle/uniswap-v2-arbitrage-strategy';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { UniswapV3PoolStateSyncerContractQuery } from './uniswap/uniswap-v3-pool-state-syncer-contract-query';
import { JSBI } from '@uniswap/sdk';

const provider = new providers.InfuraProvider(NETWORK, INFURA_API_KEY);
const provider2 = new providers.AlchemyProvider(NETWORK, 'a0SpOFIBbxj6-0h4q8PyDjF1xKIqScxB');
const provider3 = new providers.WebSocketProvider(
  'wss://goerli.infura.io/ws/v3/8ac04e84ff9e4fd19db5bfa857b90a92',
  NETWORK,
);
const provider4 = new providers.WebSocketProvider(
  'wss://eth-goerli.ws.alchemyapi.io/v2/a0SpOFIBbxj6-0h4q8PyDjF1xKIqScxB',
  NETWORK,
);

async function testSpeed() {
  const test = [
    [provider, 'Infura'],
    [provider2, 'Alchemy'],
    [provider3, 'WS Infura'],
    [provider4, 'WS Alchemy'],
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

//testSpeed();

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  console.log(`Launching on ${NETWORK} ${USE_FLASHBOTS ? 'using flashbots ' : ''}...`);

  const sender = USE_FLASHBOTS
    ? await FlashbotsTransactionSender.create(provider, NETWORK, FLASHBOTS_RELAY_SIGNING_KEY)
    : new Web3TransactionSender(provider, 2);

  const LAST_BLOCK = await getLastBlockNumber(provider);
  const factories: EthMarketFactory[] = [
    /*...UNISWAP_V2_FACTORY_ADDRESSES.map(
      (address) => new UniswapV2MarketFactory(provider, address, LAST_BLOCK),
    ),*/
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

  const runner = new ArbitrageRunner(
    allowedMarkets,
    [
      new TriangleArbitrageStrategy(
        {
          [WETH_ADDRESS]: [ETHER.mul(13)], //, ETHER.mul(10), ETHER]
        },
        allowedMarkets,
      ),
      //new UniswapV2ArbitrageStrategy({ startAddresses: [WETH_ADDRESS] }, allowedMarkets),
    ],
    new UniswapV2ReservesSyncer(provider, 5, 1000),
    new UniswapV3PoolStateSyncer(provider, 3),
    provider,
  );

  let marketsV3 = markets as UniswapV3Market[];
  const syncer = new UniswapV3PoolStateSyncer(provider, 10);
  await syncer.syncPoolStates(marketsV3);

  marketsV3 = marketsV3
    .sort((a, b) => {
      const countA = a?.pool?.advancedTicks?.length ?? 0;
      const countB = b?.pool?.advancedTicks?.length ?? 0;
      return countA - countB;
    })
    .slice(0, markets.length);

  startTime();
  await syncer.syncPoolStates(marketsV3);
  console.log(`GRAPH TIME`, endTime());

  /*
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  market1.setPoolState(
    market1?.pool?.tickCurrent ?? 0,
    BigNumber.from(market1?.pool?.sqrtRatioX96?.toString()),
    BigNumber.from(market1?.pool?.liquidity?.toString()),
    tickets2
  );
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  console.log(market1.calcTokensOut('sell', ETHER.mul(10000000))?.toString());
  console.log(tickets1.length, 'vs', tickets2.length);*/

  const syncer1 = new UniswapV3PoolStateSyncerContractQuery(provider, 10);
  const syncer2 = new UniswapV3PoolStateSyncerContractQuery(provider2, 10);
  const syncer3 = new UniswapV3PoolStateSyncerContractQuery(provider3, 10);
  const syncer4 = new UniswapV3PoolStateSyncerContractQuery(provider4, 10);

  startTime();
  await syncer4.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());
  await syncer3.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());
  await syncer2.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());
  await syncer1.syncPoolStates(marketsV3);
  console.log(`CONTRACT TIME`, endTime());

  let market = marketsV3[marketsV3.length - 1];
  let ticks = market?.pool?.advancedTicks ?? [];
  let tick = market?.pool?.tickCurrent ?? 0;
  let sqrtRatioX96 = BigNumber.from(market?.pool?.sqrtRatioX96?.toString());
  let liquidity = BigNumber.from(market?.pool?.liquidity?.toString());
  let result: BigNumber | null;
  let amount = ETHER.mul(10000000);

  ticks = ticks.sort((a, b) => a.index - b.index);
  market.setPoolState(tick, sqrtRatioX96, liquidity, ticks);
  result = market.calcTokensOut('sell', amount);
  console.log('Subgraph:', result?.toString());

  market.setPoolState(
    tick,
    sqrtRatioX96,
    liquidity,
    ticks.filter((tick) => JSBI.notEqual(tick.liquidityNet, JSBI.BigInt(0))),
  );
  result = market.calcTokensOut('sell', amount);
  console.log('Non zero:', result?.toString());

  market.setPoolState(tick, sqrtRatioX96, liquidity, ticks);
  result = market.calcTokensOut('sell', amount);
  console.log('Subgraph:', result?.toString());

  market.setPoolState(
    tick,
    sqrtRatioX96,
    liquidity,
    ticks.filter((tick) => JSBI.notEqual(tick.liquidityNet, JSBI.BigInt(0))),
  );
  result = market.calcTokensOut('sell', amount);
  console.log('Non zero:', result?.toString());

  const quoter = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
  console.log(
    `Quoter  :`,
    (
      await quoter.callStatic
        .quoteExactInputSingle(market.tokens[0], market.tokens[1], market.fee, amount.toString(), 0)
        .catch(() => null)
    )?.toString(),
  );

  //const lastMarket = marketsV3[marketsV3.length - 1];

  /*await syncer.syncPoolStates(marketsV3, 0);
  let totalTicksCount = 0;
  const map: Record<string, number> = marketsV3.reduce((acc, market) => {
    const count = market?.pool?.advancedTicks?.length ?? 0;
    totalTicksCount += count;
    acc[count.toString()] = (acc[count.toString()] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log(map);
  //14772918 = 118880
  //14772953 = 118882
  //14773032 = 118886
  //14773045 = 118888
  console.log(totalTicksCount);
  console.log(await getLastBlockNumber(provider));

  const biggest = marketsV3.reduce((acc, market) => {
    if (!acc) {
      return market;
    }

    if ((acc?.pool?.advancedTicks?.length ?? 0) < (market?.pool?.advancedTicks?.length ?? 0)) {
      return market;
    }

    return acc;
  }, null as UniswapV3Market | null) as UniswapV3Market;

  //const biggestContract = new Contract(biggest.marketAddress, UNISWAP_V3_POOL_ABI, provider);
  const biggestTicks = biggest?.pool?.advancedTicks ?? [];
  const biggestTicksSpacingSet = new Set<number>();
  biggestTicks.forEach(tick => {
    biggestTicksSpacingSet.add(tick.index);
  });
  const biggestTicksSpacing = Array.from(biggestTicksSpacingSet);
  console.log(biggestTicksSpacing);

  const abi = JSON.parse(fs.readFileSync('./artifacts/contracts/MoneyPrinterQuery.sol/MoneyPrinterQuery.json').toString()).abi;
  const address = '0xB54AC38D373555FC9450a2Ca311Ea810B726cB57';
  const queryContract = new Contract(address, abi, provider);

  async function getTicks(address: string): Promise<Tick[]> {
    const outputContract = (await queryContract.functions.getTicksForPool(address, 5000))[0] as any[];
    return outputContract.map(item => {
      return new Tick({
        index: item[0].toNumber(),
        liquidityGross: JSBI.BigInt(0),
        liquidityNet: JSBI.BigInt(item[1].toString())
      });
    })
  }

  async function requestStates(addresses: string[], bufferSize: number): Promise<void> {
    startTime('requestStates');

    const outputContract = (await queryContract.functions.getStatesForPools(addresses, bufferSize))[0] as any[];

    for (const res of outputContract) {
      console.log(res.ticks.length);
    }

    console.log(`States ${addresses.length} requested in ${endTime('requestStates')}ms`);
  }

  const biggestTicks2 = await getTicks(biggest.marketAddress);
  console.log(biggestTicks2);
  console.log(biggestTicks.length);
  console.log(biggestTicks2.length);

  const biggestTicksNonZero = biggestTicks.filter(tick => JSBI.greaterThan(tick.liquidityNet, JSBI.BigInt(0)));
  const biggestTicks2NonZero = biggestTicks2.filter(tick => JSBI.greaterThan(tick.liquidityNet, JSBI.BigInt(0)));
  console.log(biggestTicksNonZero.length);
  console.log(biggestTicks2NonZero.length);

  const requestCount = 2;
  const requestAddresses = Array.from({ length: requestCount }).map(() => biggest.marketAddress);
  await requestStates(requestAddresses, 1200);
  */

  const thisBlock$ = runner.thisBlock$;
  const concurrentSimulationCount = 20;
  const simulatedOpportunities$ = runner.start().pipe(
    concatMap((event) => {
      //TODO: if one opportunity will fail the simulation, the ones that were filtrated because of it - may not
      //const opportunities = filterCorrelatingOpportunities(event.opportunities);
      const opportunities = event.opportunities;
      console.log(
        `Found opportunities: ${event.opportunities.length}, non-correlating: ${
          opportunities.length
        } in ${endTime('render')}ms\n`,
      );

      console.log(`Gas price: ${event.baseFeePerGas.toString()} at ${event.blockNumber}`);

      return merge(
        ...opportunities.map((opportunity) =>
          thisBlock$.pipe(
            concatMap((blockNumber) => {
              if (blockNumber > opportunity.blockNumber) {
                //если блок уже неактуальный, откладываем все до лучших времен.
                console.log(
                  `Simulation postponed. Old block ${opportunity.blockNumber} / ${blockNumber}`,
                );
                runner.queueOpportunity(opportunity);
                return EMPTY;
              }

              return defer(() =>
                executor.simulateOpportunity(opportunity, event.baseFeePerGas),
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
          ),
        ),
        concurrentSimulationCount,
      );
    }),
  );

  simulatedOpportunities$.pipe(
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
          );
        }),
      );
    }),
  );
  //.subscribe();
}

main();
