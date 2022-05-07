import { BigNumber, Contract, PopulatedTransaction, providers, utils, Wallet } from 'ethers';
import { take } from 'rxjs';
import { ArbitrageBlacklist } from './arbitrage-blacklist';
import { ArbitrageRunner } from './arbitrage-runner';
import {
  ArbitrageOpportunity,
  BLACKLIST_MARKETS,
  BLACKLIST_TOKENS,
  endTime,
  ERC20_ABI,
  ETHER,
  EthMarket,
  EthMarketFactory,
  MONEY_PRINTER_ABI,
  MultipleCallData,
  printOpportunity,
  TransactionSender,
  UNISWAP_V2_FACTORY_ADDRESSES,
  UNISWAP_V3_FACTORY_ADDRESSES,
  WETH_ADDRESS,
} from './entities';
import { FlashbotsTransactionSender } from './sender/flashbots-transaction-sender';
import { Web3TransactionSender } from './sender/web3-transaction-sender';
import { TriangleArbitrageStrategy } from './triangle/triangle-arbitrage-strategy';
import { UniswapV2MarketFactory } from './uniswap/uniswap-v2-market-factory';
import { UniswapV2ReservesSyncer } from './uniswap/uniswap-v2-reserves-syncer';
import { UniswapV3MarketFactory } from './uniswap/uniswap-v3-market-factory';
import { UniswapV3PoolStateSyncer } from './uniswap/uniswap-v3-pool-state-syncer';

const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0xe287672c1f7b7a8a38449626b3303a2ad4430672977b8a6f741a9ca35b6ca10c';
const MONEY_PRINTER_ADDRESS = '0x18B6EA53FBDBB38d3E3df4E86Bf52E2512EAc619'; // last working '0x51fbc7797B6fD53aFA8Ce0CAbF5a35c60B198837';

const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY;

const NETWORK = 'goerli';
const useFlashbots = true;

const provider = new providers.InfuraProvider(NETWORK, '8ac04e84ff9e4fd19db5bfa857b90a92');
const moneyPrinterContract = new Contract(MONEY_PRINTER_ADDRESS, MONEY_PRINTER_ABI, provider);

const arbitrageSigningWallet = new Wallet(PRIVATE_KEY);

async function createRegularSwap(
  callData: MultipleCallData,
  printMoneyContract: Contract,
  ethAmountToCoinbase: BigNumber,
): Promise<PopulatedTransaction> {
  const nonce = await provider.getTransactionCount(arbitrageSigningWallet.address);
  const transaction = await printMoneyContract.populateTransaction.printMoney(
    ethAmountToCoinbase,
    callData.targets,
    callData.data,
    {
      nonce: nonce,
      gasPrice: await provider.getGasPrice(),
      gasLimit: BigNumber.from(4000000),
    },
  );
  return transaction;
}

//{ '1': 116, '10': 712, '60': 3038, '200': 2673 };
async function main() {
  //TODO: filter markets by reserves after retrieval
  //TODO: ensure all token addresses from different markets are checksumed
  //12370000 = 9 marketsV3
  //12369800 = 2 marketsV3

  const sender = useFlashbots
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

  runner
    .start()
    .pipe(take(1))
    .subscribe(async (opportunities) => {
      console.log(`Found opportunities: ${opportunities.length} in ${endTime('render')}ms\n`);

      // sortedOpportunities.forEach(printOpportunity);
      for (let opportunity of opportunities) {
        printOpportunity(opportunity);
        await executeOpportunity(opportunity, sender);
      }
    });
}

main();

async function executeOpportunity(
  opportunity: ArbitrageOpportunity,
  sender: TransactionSender,
): Promise<void> {
  const callData: MultipleCallData = { data: [], targets: [] };

  let lowMoney = true; // TODO: check if we have enough money
  let ethAmountToCoinbase = useFlashbots ? opportunity.profit.div(2) : BigNumber.from(0);

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
    let transactionData;

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

      transactionData = await createRegularSwap(
        { data: [loanTransaction.data], targets: [firstOperation.market.marketAddress] },
        moneyPrinterContract,
        ethAmountToCoinbase,
      );
    } else {
      transactionData = await createRegularSwap(
        callData,
        moneyPrinterContract,
        ethAmountToCoinbase,
      );
    }

    const receipt = await sender.sendTransaction({
      signer: arbitrageSigningWallet,
      transactionData,
      blockNumber: opportunity.blockNumber + 1,
    });

    console.log('result is', receipt);
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
