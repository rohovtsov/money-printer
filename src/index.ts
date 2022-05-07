import { providers } from 'ethers';
import { defer, EMPTY, filter, from, map, mergeMap, shareReplay, skip, switchMap, take } from 'rxjs';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageRunner, filterCorrelatingOpportunities } from './arbitrage-runner';
import {
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory, FLASHBOTS_RELAY_SIGNING_KEY, INFURA_API_KEY,
  NETWORK,
  printOpportunity, PRIVATE_KEY, startTime,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES, USE_FLASHBOTS,
  WETH_ADDRESS,
} from './entities';
import { FlashbotsTransactionSender } from './sender/flashbots-transaction-sender';
import { Web3TransactionSender } from './sender/web3-transaction-sender';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { ArbitrageExecutor } from './arbitrage-executor';
import { combineLatest } from 'rxjs';
import { catchError } from 'rxjs/operators';

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
  const currentGasPrice$ = runner.currentBlock$.pipe(
    switchMap(blockNumber => defer(async () => ({
      gasPrice: await provider.getGasPrice(),
      blockNumber: blockNumber,
    }))),
    shareReplay()
  );

  const opportunities$ = runner
    .start()
    .pipe(
      switchMap((allOpportunities) => {
        //TODO: if one opportunity will fail the simulation, the ones that were filtrated because of it - may not
        const filteredOpportunities = filterCorrelatingOpportunities(allOpportunities);
        console.log(`Found opportunities: ${allOpportunities.length}, non-correlating: ${filteredOpportunities.length} in ${endTime('render')}ms\n`);
        return from(filteredOpportunities);
      }),
    );

  const simulatedOpportunities$ = combineLatest([
    currentBlock$,
    currentGasPrice$,
    opportunities$,
  ]).pipe(
    filter(([currentBlock, blockState, opportunity]) => {
      return currentBlock === blockState.blockNumber && currentBlock === opportunity.blockNumber;
    }),
    mergeMap(([_, blockState, opportunity]) => {
      return from(executor.simulateOpportunity(opportunity, blockState.gasPrice.mul(1))).pipe(
        catchError(() => {
          return EMPTY;
        })
      );
    }, 10),
  );

  combineLatest([
    currentBlock$,
    simulatedOpportunities$,
  ]).pipe(
    filter(([currentBlock, opportunity]) => {
      return currentBlock === opportunity.blockNumber;
    }),
    take(1),
    mergeMap(([_, opportunity]) => {
      printOpportunity(opportunity);
      return from(executor.executeOpportunity(opportunity));
    }, 10),
  ).subscribe();
}

main();
