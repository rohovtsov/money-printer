import { providers } from 'ethers';
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
  INFURA_API_KEY,
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
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { UniswapV2ArbitrageStrategy } from './triangle/uniswap-v2-arbitrage-strategy';
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
          [WETH_ADDRESS]: [ETHER, ETHER.mul(4)], //, ETHER.mul(10), ETHER]
        },
        allowedMarkets,
      ),
      new UniswapV2ArbitrageStrategy({ startAddresses: [WETH_ADDRESS] }, allowedMarkets),
    ],
    new UniswapV2ReservesSyncer(provider, 5, 1000),
    new UniswapV3PoolStateSyncer(provider, 3),
    provider,
  );

  const currentBlock$ = runner.currentBlock$;
  const thisBlock$ = runner.currentBlock$.pipe(take(1));
  const currentBlockState$ = currentBlock$.pipe(
    switchMap((blockNumber) =>
      defer(async () => ({
        gasPrice: await getBaseFeePerGas(provider, blockNumber),
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
          console.log(`Gas price: ${gasPrice}`);
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

                  return defer(() => executor.simulateOpportunity(opportunity, gasPrice)).pipe(
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
    }),
  );

  simulatedOpportunities$
    .pipe(
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
    )
    .subscribe();
}

main();
