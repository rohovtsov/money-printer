import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
// import Web3 from 'web3';
import { BigNumber, Contract, providers, Wallet, utils } from 'ethers';
import { take } from 'rxjs';
import {
  BLACKLIST_MARKETS,
  MONEY_PRINTER_ABI,
  endTime,
  ETHER,
  EthMarket,
  EthMarketFactory,
  groupEthMarkets,
  GWEI,
  MultipleCallData,
  PRINTER_QUERY_ABI,
  PRINTER_QUERY_ADDRESS,
  printOpportunity,
  startTime,
  UNISWAP_V2_PAIR_ABI,
  UNISWAP_V3_POOL_ABI,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  WETH_ADDRESS,
  WETH_ABI,
  ERC20_ABI,
  ArbitrageOpportunity,
  BLACKLIST_TOKENS,
} from './entities';
import { UniswappyV2EthPair } from './old/UniswappyV2EthPair';
import { Arbitrage2 } from './old/Arbitrage2';
import { get } from 'https';
import { getDefaultRelaySigningKey } from './entities';
import { UniswapV2Market } from './uniswap/uniswap-v2-market';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { ArbitrageRunner } from './arbitrage-runner';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { WETH } from '@uniswap/sdk';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';
import { swapLocal, swapTest } from './old/UniswapV3Pool';
import { UniswapV3Market } from './uniswap/uniswap-v3-market';
import { ArbitrageBlacklist } from './arbitrage-blacklist';

// const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || "https://mainnet.infura.io/v3/08a6fc8910ca460e99dd411ec0286be6"
const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0xe287672c1f7b7a8a38449626b3303a2ad4430672977b8a6f741a9ca35b6ca10c';
// const BUNDLE_EXECUTOR_ADDRESS = process.env.BUNDLE_EXECUTOR_ADDRESS || ""
const MONEY_PRINTER_ADDRESS = '0x18B6EA53FBDBB38d3E3df4E86Bf52E2512EAc619'; // last working '0x51fbc7797B6fD53aFA8Ce0CAbF5a35c60B198837';

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

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || '';

const provider = new providers.InfuraProvider('goerli', '8ac04e84ff9e4fd19db5bfa857b90a92');
const moneyPrinterContract = new Contract(MONEY_PRINTER_ADDRESS, MONEY_PRINTER_ABI, provider);

const arbitrageSigningWallet = new Wallet(PRIVATE_KEY);
// const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY);

async function executeRegularSwap(
  callData: MultipleCallData,
  printMoneyContract: Contract,
  executorWallet: Wallet,
) {
  const nonce = await provider.getTransactionCount(arbitrageSigningWallet.address);
  const transaction = await printMoneyContract.populateTransaction.printMoney(
    BigNumber.from(0),
    callData.targets,
    callData.data,
    {
      nonce: nonce,
      gasPrice: await provider.getGasPrice(),
      gasLimit: BigNumber.from(4000000),
    },
  );

  /* try {
    const estimateGas = await bundleExecutorContract.provider.estimateGas({
      ...transaction,
      from: executorWallet.address,
    });
    if (estimateGas.gt(1400000)) {
      console.log('EstimateGas succeeded, but suspiciously large: ' + estimateGas.toString());
      return;
    }
    transaction.gasLimit = estimateGas.mul(2);
  } catch (e) {
    console.warn(`Estimate gas failure for `);
    throw e;
    // return;
  }*/
  const bundledTransactions = [
    {
      signer: executorWallet,
      transaction: transaction,
    },
  ];

  const signedTransaction = await executorWallet.signTransaction(transaction);
  const result = await provider.sendTransaction(signedTransaction);

  console.log(result);
  console.log(await result.wait(2));

  // const signedBundle = await this.flashbotsProvider.signBundle(bundledTransactions);
  //
  // const simulation = await this.flashbotsProvider.simulate(signedBundle, blockNumber + 1);
  // if ('error' in simulation || simulation.firstRevert !== undefined) {
  //   console.log(`Simulation Error on token ${bestCrossedMarket.tokenAddress}, skipping`);
  //   continue;
  // }
  // console.log(
  //   `Submitting bundle, profit sent to miner: ${bigNumberToDecimal(
  //     simulation.coinbaseDiff,
  //   )}, effective gas price: ${bigNumberToDecimal(
  //     simulation.coinbaseDiff.div(simulation.totalGasUsed),
  //     9,
  //   )} GWEI`,
  // );
  // const bundlePromises = _.map([blockNumber + 1, blockNumber + 2], (targetBlockNumber) =>
  //   this.flashbotsProvider.sendRawBundle(signedBundle, targetBlockNumber),
  // );
  // await Promise.all(bundlePromises);
  // return;
}

//{ '1': 116, '10': 712, '60': 3038, '200': 2673 };
async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3
  const LAST_BLOCK = 20000000;
  const factories: EthMarketFactory[] = [
    ...UNISWAP_V2_FACTORY_ADDRESSES.map(
      (address) => new UniswapV2MarketFactory(provider, address, LAST_BLOCK),
    ),
    new UniswapV3MarketFactory(provider, UNISWAP_V3_FACTORY_ADDRESS, LAST_BLOCK),
  ];

  const markets: EthMarket[] = (
    await Promise.all(factories.map((factory) => factory.getEthMarkets()))
  ).reduce((acc, markets) => [...acc, ...markets], []);

  console.log(`Loaded markets: ${markets.length}`);

  const blacklist = new ArbitrageBlacklist(BLACKLIST_MARKETS, BLACKLIST_TOKENS);
  const allowedMarkets = blacklist.filterMarkets(markets);
  console.log(allowedMarkets.length);

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

  runner
    .start()
    .pipe(take(1))
    .subscribe(async (opportunities) => {
      console.log(`Found opportunities: ${opportunities.length} in ${endTime('render')}ms\n`);

      // sortedOpportunities.forEach(printOpportunity);
      for (let opportunity of opportunities) {
        printOpportunity(opportunity);
        await executeOpportunity(opportunity);
      }
    });

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
// withdrawWeth(ETHER.mul(2), bundleExecutorContract, arbitrageSigningWallet); // если хочется вывести 2 кефира например

async function executeOpportunity(opportunity: ArbitrageOpportunity): Promise<void> {
  const callData: MultipleCallData = { data: [], targets: [] };

  let lowMoney = true; // TODO: check if we have enough money

  for (let i = 0; i < opportunity.operations.length; i++) {
    const currentOperation = opportunity.operations[i];
    const nextOperation = opportunity.operations[i + 1];

    // pre first step operations
    if (i === 0) {
      if (lowMoney) {
        // flashloan swap
        if (currentOperation.market.protocol === 'uniswapV2') {
          // выполняем флеш займ в конце всех шагов, т.к. он упаковывает в себя их дату
          const trans = await new Contract(
            currentOperation.tokenOut,
            ERC20_ABI,
            provider,
          ).populateTransaction.transfer(
            getNextAddress(nextOperation.market),
            currentOperation.amountOut,
          );

          if (!trans || !trans.data) {
            throw new Error('Failed to populate transaction 4');
          }

          callData.data.push(trans.data);
          callData.targets.push(currentOperation.tokenOut);
          continue;
        } else {
          // кажется что для v3 не нужны дополнительные шаги
          // throw new Error('flash swap on v3 is not implemented yet');
          continue;
        }
      } else {
        // regular swap
        // move weth to the first v2 market
        if (currentOperation.market.protocol === 'uniswapV2') {
          const transaction = await new Contract(
            WETH_ADDRESS,
            ERC20_ABI,
            provider,
          ).populateTransaction.transfer(
            currentOperation.market.marketAddress,
            opportunity.operations[0].amountIn,
          );
          if (!transaction || !transaction.data) {
            throw new Error('Failed to populate transaction 1');
          }
          callData.data.push(transaction.data);
          callData.targets.push(WETH_ADDRESS);
        } else {
          // для v3 для обычного свопа нет необходимости переводить weth, он будет выплачен внутри коллбека
        }
      }
    }

    const data = await currentOperation.market.performSwap(
      currentOperation.amountIn,
      currentOperation.action,
      !nextOperation || nextOperation.market.protocol === 'uniswapV3'
        ? moneyPrinterContract.address
        : nextOperation.market,
      [],
    );
    callData.data.push(data.data);
    callData.targets.push(data.target);
  }

  console.log('callData is collected', callData);
  try {
    if (lowMoney) {
      const firstOperation = opportunity.operations[0];
      const abiCoder = new utils.AbiCoder();
      const data = abiCoder.encode(
        ['uint256', 'address[]', 'bytes[]'],
        [opportunity.operations[0].amountIn, callData.targets, callData.data],
      );
      const loanTransaction = await firstOperation.market.performSwap(
        firstOperation.amountIn,
        firstOperation.action,
        MONEY_PRINTER_ADDRESS,
        data,
      );

      if (!loanTransaction || !loanTransaction.data) {
        throw new Error('Failed to populate transaction 5');
      }

      const result = await executeRegularSwap(
        { data: [loanTransaction.data], targets: [firstOperation.market.marketAddress] },
        moneyPrinterContract,
        arbitrageSigningWallet,
      );
      console.log('result is', result);
    } else {
      const result = await executeRegularSwap(
        callData,
        moneyPrinterContract,
        arbitrageSigningWallet,
      );
      console.log('result is', result);
    }
  } catch (e) {
    console.log('error is', e);
  }
}

function getNextAddress(nextMarket: EthMarket): string {
  if (nextMarket.protocol === 'uniswapV2') {
    return nextMarket.marketAddress;
  }

  return MONEY_PRINTER_ADDRESS;
}
