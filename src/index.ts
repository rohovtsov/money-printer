import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { Contract, providers, Wallet } from "ethers";
import {
  BUNDLE_EXECUTOR_ABI,
  EthMarket,
  EthMarketFactory,
  groupEthMarkets,
  UNISWAP_V2_FACTORY_ADDRESSES, WETH_ADDRESS
} from "./entities";
import { UniswappyV2EthPair } from "./old/UniswappyV2EthPair";
import { Arbitrage2 } from "./old/Arbitrage2";
import { get } from "https"
import { getDefaultRelaySigningKey } from "./entities";
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { ArbitrageRunner } from './arbitrage-runner';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { WETH } from '@uniswap/sdk';

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

const provider = new providers.InfuraProvider('homestead', '08a6fc8910ca460e99dd411ec0286be6');

// const arbitrageSigningWallet = new Wallet(PRIVATE_KEY);
// const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY);

function healthcheck() {
  if (HEALTHCHECK_URL === "") {
    return
  }
  get(HEALTHCHECK_URL).on('error', console.error);
}

async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  const factories: EthMarketFactory[] = UNISWAP_V2_FACTORY_ADDRESSES
    .map(address => new UniswapV2MarketFactory(provider, address, 1, 1000));
  const markets: EthMarket[] = (await Promise.all(factories.map(factory => factory.getEthMarkets())))
    .reduce((acc, markets) => [...acc, ...markets], []);
  const groupedMarkets = groupEthMarkets(markets);

  console.log(markets.length);

  const runner = new ArbitrageRunner(markets, [
    new TriangleArbitrageStrategy([WETH_ADDRESS], groupedMarkets)
  ], provider);

  runner.start();

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
