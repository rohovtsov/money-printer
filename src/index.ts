import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { Contract, providers, Wallet } from "ethers";
import {
  BUNDLE_EXECUTOR_ABI,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  groupEthMarkets, GWEI,
  PRINTER_QUERY_ABI,
  PRINTER_QUERY_ADDRESS,
  startTime,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  WETH_ADDRESS
} from "./entities";
import { UniswappyV2EthPair } from "./old/UniswappyV2EthPair";
import { Arbitrage2 } from "./old/Arbitrage2";
import { get } from "https"
import { getDefaultRelaySigningKey } from "./entities";
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { ArbitrageRunner } from './arbitrage-runner';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { WETH } from '@uniswap/sdk';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';

// const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "https://mainnet.infura.io/v3/08a6fc8910ca460e99dd411ec0286be6"
// const PRIVATE_KEY = process.env.PRIVATE_KEY || ""
// const BUNDLE_EXECUTOR_ADDRESS = process.env.BUNDLE_EXECUTOR_ADDRESS || ""

// const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || getDefaultRelaySigningKey();

// const MINER_REWARD_PERCENTAGE = parseInt(process.env.MINER_REWARD_PERCENTAGE || "80")

// if (PRIVATE_KEY === "") {
//   console.warn("Must provide PRIVATE_KEY environment variable")
//   process.exit(1)
// }
// if (BUNDLE_EXECUTOR_ADDRESS === "") {
//   console.warn("Must provide BUNDLE_EXECUTOR_ADDRESS environment variable. Please see README.md")
//   process.exit(1)
// }

// if (FLASHBOTS_RELAY_SIGNING_KEY === "") {
//   console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY. Please see https://github.com/flashbots/pm/blob/main/guides/searcher-onboarding.md")
//   process.exit(1)
// }

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

const provider = new providers.InfuraProvider('ropsten', '8ac04e84ff9e4fd19db5bfa857b90a92');

// const arbitrageSigningWallet = new Wallet(PRIVATE_KEY);
// const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY);



async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  const LAST_BLOCK = 20000000;
  const factories: EthMarketFactory[] = [
    //...UNISWAP_V2_FACTORY_ADDRESSES.map(address => new UniswapV2MarketFactory(provider, address, LAST_BLOCK)),
    new UniswapV3MarketFactory(provider, UNISWAP_V3_FACTORY_ADDRESS, LAST_BLOCK)
  ];

  const markets: EthMarket[] = (await Promise.all(factories.map(factory => factory.getEthMarkets())))
    .reduce((acc, markets) => [...acc, ...markets], []);
  const groupedMarkets = groupEthMarkets(markets);

  console.log(`Loaded markets: ${markets.length}`);

  const quoterContract = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
  console.log(await quoterContract.callStatic.quoteExactInputSingle(markets[0].tokens[0], markets[0].tokens[1], '500', GWEI.toString(), 0));

  startTime('time');
  const marketsToQuery = markets.slice(0, 100);
  const addressesToQuery = marketsToQuery.map(m => m.marketAddress);//['0xCc2158F95786CAE412e2b1ea352DF8eF47A1f15c'];
  const amounts = [ETHER?.toString(), ETHER.mul(10)?.toString(), ETHER.mul(100)?.toString()];
  const moneyPrinter = new Contract(PRINTER_QUERY_ADDRESS, PRINTER_QUERY_ABI, provider);
  console.log(addressesToQuery);
  console.log(amounts);
  const prices = await moneyPrinter.callStatic.getPricesForPools(addressesToQuery, amounts);
  console.log(prices);
  for (let i = 0; i < prices.length; i++) {
    console.log(`Market: ${marketsToQuery[i].marketAddress}`);
    for (let j = 0; j < prices[i].length; j++) {
      console.log(prices[i][j][0]?.toString(), prices[i][j][1]?.toString());
    }
  }
  console.log(`Prices for ${marketsToQuery.length} markets loaded in ${endTime('time')}ms`);


  const runner = new ArbitrageRunner(
    markets,
    [
      new TriangleArbitrageStrategy({
        [WETH_ADDRESS]: [ETHER.mul(100)],//, ETHER.mul(10), ETHER]
      }, groupedMarkets),
    ],
    new UniswapV2ReservesSyncer(provider, 5, 5000),
    new UniswapV3PoolStateSyncer(provider, 1000),
    provider
  );

  runner.start().subscribe();

  // console.log("Searcher Wallet Address: " + await arbitrageSigningWallet.getAddress())
  // console.log("Flashbots Relay Signing Wallet Address: " + await flashbotsRelaySigningWallet.getAddress())
  // const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet);
  /*const arbitrage = new Arbitrage(
    // arbitrageSigningWallet
    // flashbotsProvider,
    // new Contract(BUNDLE_EXECUTOR_ADDRESS, BUNDLE_EXECUTOR_ABI, provider)
  )

  const markets = await UniswappyV2EthPair.getUniswapMarketsByToken(provider, FACTORY_ADDRESSES);
  provider.on('block', async (blockNumber) => {
    await UniswappyV2EthPair.updateReserves(provider, markets.allMarketPairs);
    const bestCrossedMarkets = await arbitrage.evaluateMarkets(markets.marketsByToken);
    if (bestCrossedMarkets.length === 0) {
      console.log("No crossed markets")
      return
    }
    bestCrossedMarkets.forEach(Arbitrage.printCrossedMarket);
    console.log(bestCrossedMarkets, blockNumber);
    // arbitrage.takeCrossedMarkets(bestCrossedMarkets, blockNumber, MINER_REWARD_PERCENTAGE).then(healthcheck).catch(console.error)
  })*/
}

main();
