import { BigNumber, providers } from 'ethers';
import {
  concatMap,
  defer,
  EMPTY,
  filter,
  map,
  merge,
  mergeMap,
  of,
  shareReplay,
  switchMap,
  take,
} from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageExecutor } from './arbitrage-executor';
import { ArbitrageRunner, filterCorrelatingOpportunities } from './arbitrage-runner';
import {
  ArbitrageOpportunity,
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  FLASHBOTS_RELAY_SIGNING_KEY,
  INFURA_API_KEY,
  NETWORK,
  printOpportunity,
  PRIVATE_KEY,
  rateLimit,
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
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';

const provider = new providers.InfuraProvider(NETWORK, INFURA_API_KEY);

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  console.log(`Launching on ${NETWORK} ${USE_FLASHBOTS ? 'using flashbots ' : ''}...`);

  const sender = USE_FLASHBOTS
    ? await FlashbotsTransactionSender.create(provider, NETWORK, FLASHBOTS_RELAY_SIGNING_KEY)
    : new Web3TransactionSender(provider, 2);

  const LAST_BLOCK = 20000000;
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

  const runner = new ArbitrageRunner(
    allowedMarkets,
    [
      new TriangleArbitrageStrategy(
        {
          [WETH_ADDRESS]: [ETHER.div(100)], //, ETHER.mul(10), ETHER]
        },
        allowedMarkets,
      ),
    ],
    new UniswapV2ReservesSyncer(provider, 5, 1000),
    new UniswapV3PoolStateSyncer(provider, 3),
    provider,
  );

  const currentBlock$ = runner.currentBlock$;
  const currentBlockState$ = currentBlock$.pipe(
    switchMap((blockNumber) =>
      defer(async () => ({
        gasPrice: await provider.getGasPrice(),
        blockNumber: blockNumber,
      })),
    ),
    shareReplay(1),
  );

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

      const gasPrice$ = currentBlockState$.pipe(
        filter((state) => state.blockNumber >= event.blockNumber),
        map((state) => state.gasPrice),
        take(1),
      );

      return gasPrice$.pipe(
        concatMap((gasPrice) => {
          return merge(
            ...opportunities.map((opportunity) =>
              defer(() => executor.simulateOpportunity(opportunity, gasPrice)).pipe(
                catchError(() => of(opportunity)),
              ),
            ),
            concurrentSimulationCount,
          );
        }),
        concatMap((opportunity: ArbitrageOpportunity | SimulatedArbitrageOpportunity) => {
          const profitNet = (opportunity as SimulatedArbitrageOpportunity)?.profitNet ?? undefined;

          if (profitNet && profitNet.gt(BigNumber.from(0))) {
            const simulatedOpportunity = opportunity as SimulatedArbitrageOpportunity;
            runner.queueOpportunity(simulatedOpportunity);
            return of(simulatedOpportunity);
          }

          return EMPTY;
        }),
      );
    }),
  );

  simulatedOpportunities$
    .pipe(
      mergeMap((opportunity) => {
        return currentBlock$.pipe(
          concatMap((currentBlock) => {
            if (currentBlock > opportunity.blockNumber) {
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
    )
    .subscribe();
}

main();
