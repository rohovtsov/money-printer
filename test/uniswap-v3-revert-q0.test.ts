import { BigNumber, Contract, ethers, providers, Wallet } from 'ethers';
import { UniswapV3MarketFactory } from '../src/uniswap/uniswap-v3-market-factory';
import {
  GWEI,
  ETHER,
  UNISWAP_V3_FACTORY_ADDRESS,
  UNISWAP_V3_QUOTER_ABI,
  UNISWAP_V3_QUOTER_ADDRESS,
  startTime,
  endTime,
  ERC20_ABI,
  createFlashbotsBundleProvider,
  PRIVATE_KEY,
  WETH_ADDRESS,
  printOpportunity,
  NETWORK,
  getBaseFeePerGas,
  UNISWAP_V2_PAIR_ABI,
  getLastBlockNumber,
} from '../src/entities';
import { UniswapV3Market } from '../src/uniswap/uniswap-v3-market';
import { UniswapV3PoolStateSyncer } from '../src/uniswap/uniswap-v3-pool-state-syncer';
import { FeeAmount, Pool, Tick } from '@uniswap/v3-sdk';
import { ChainId, JSBI } from '@uniswap/sdk';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { expect } from 'chai';
import { NativePool } from '../src/uniswap/native-pool/native-pool';
import { NativeTick } from '../src/uniswap/native-pool/native-pool-utils';
import { SyncSdkPool } from '../src/uniswap/sync-sdk-pool/sync-sdk-pool';
import fs from 'fs';
import { loadNangle } from '../src/serializer';
import { ArbitrageExecutor } from '../src/arbitrage-executor';
import { FlashbotsTransactionSender } from '../src/sender/flashbots-transaction-sender';
import { FixedAmountArbitrageStrategy } from '../src/strategies/fixed-amount-arbitrage-strategy';
import { UniswapV2ReservesSyncer } from '../src/uniswap/uniswap-v2-reserves-syncer';
import { UniswapV2Market } from '../src/uniswap/uniswap-v2-market';
import { TransactionRequest } from '@ethersproject/providers';

function filterResult(amount: bigint, result: any) {
  return result.map((res: any, index: number) => {
    const isInput = index >= 2;
    const liquidity = res?.[1]?.liquidity?.toString();
    const output = res?.[0]?.toSignificant(100);
    const isLiquidityZero = JSBI.lessThanOrEqual(JSBI.BigInt(liquidity ?? '0'), JSBI.BigInt(0));

    console.log(
      index,
      isInput ? 'input' : 'output',
      res?.[0]?.currency?.address,
      output,
      'liquidity',
      liquidity,
      isLiquidityZero,
    );
    if (isInput && isLiquidityZero) {
      return null;
    }

    if (amount <= 0) {
      return null;
    }

    return output ? BigNumber.from(output) : undefined;
  });
}

function calcPricesWithSyncSdkPool(pool: SyncSdkPool, amount: bigint) {
  let results = [];

  try {
    results.push(
      pool.getOutputAmountSync(CurrencyAmount.fromRawAmount(pool.token0, amount.toString())),
    );
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(
      pool.getOutputAmountSync(CurrencyAmount.fromRawAmount(pool.token1, amount.toString())),
    );
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(
      pool.getInputAmountSync(CurrencyAmount.fromRawAmount(pool.token0, amount.toString())),
    );
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(
      pool.getInputAmountSync(CurrencyAmount.fromRawAmount(pool.token1, amount.toString())),
    );
  } catch (e) {
    results.push(null);
  }

  return filterResult(amount, results);
}

function calcPricesWithNativePool(pool: NativePool, amount: bigint) {
  let results = [];

  try {
    results.push(pool.getOutputAmount(pool.token0, amount));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(pool.getOutputAmount(pool.token1, amount));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(pool.getInputAmount(pool.token0, amount));
  } catch (e) {
    results.push(null);
  }
  try {
    results.push(pool.getInputAmount(pool.token1, amount));
  } catch (e) {
    results.push(null);
  }

  return results;
}

async function calcPricesWithSdkPool(pool: Pool, amount: bigint) {
  const result = await Promise.all([
    pool
      .getOutputAmount(CurrencyAmount.fromRawAmount(pool.token0, JSBI.BigInt(amount.toString())))
      .catch(() => null),
    pool
      .getOutputAmount(CurrencyAmount.fromRawAmount(pool.token1, JSBI.BigInt(amount.toString())))
      .catch(() => null),
    pool
      .getInputAmount(CurrencyAmount.fromRawAmount(pool.token0, JSBI.BigInt(amount.toString())))
      .catch(() => null),
    pool
      .getInputAmount(CurrencyAmount.fromRawAmount(pool.token1, JSBI.BigInt(amount.toString())))
      .catch(() => null),
  ]);

  return filterResult(amount, result);
}

function createNativePool(market: UniswapV3Market): NativePool {
  return new NativePool(
    market.tokens[0],
    market.tokens[1],
    market.fee as FeeAmount,
    BigInt(market.pool?.sqrtRatioX96?.toString() ?? 0),
    BigInt(market.pool?.liquidity?.toString() ?? 0),
    market.pool?.tickCurrent ?? 0,
    (market.pool?.tickDataProvider as any)?.ticks.map(
      (tick: any) =>
        new NativeTick(tick.index, BigInt(tick.liquidityGross), BigInt(tick.liquidityNet)),
    ),
  );
}

function createSyncSdkPool(market: UniswapV3Market): SyncSdkPool {
  return new SyncSdkPool(
    new Token(ChainId.MAINNET, market.tokens[0], 0),
    new Token(ChainId.MAINNET, market.tokens[1], 0),
    market.fee as FeeAmount,
    market.pool?.sqrtRatioX96?.toString() ?? '0',
    market.pool?.liquidity?.toString() ?? '0',
    market.pool?.tickCurrent ?? 0,
    market.pool?.ticks?.map(
      (tick: any) =>
        new Tick({
          index: tick.index,
          liquidityGross: JSBI.BigInt(tick.liquidityGross.toString()),
          liquidityNet: JSBI.BigInt(tick.liquidityNet.toString()),
        }),
    ) ?? [],
  );
}

function createSdkPool(market: UniswapV3Market): Pool {
  return new Pool(
    new Token(ChainId.MAINNET, market.tokens[0], 0),
    new Token(ChainId.MAINNET, market.tokens[1], 0),
    market.fee as FeeAmount,
    market.pool?.sqrtRatioX96?.toString() ?? '0',
    market.pool?.liquidity?.toString() ?? '0',
    market.pool?.tickCurrent ?? 0,
    market.pool?.ticks?.map(
      (tick: any) =>
        new Tick({
          index: tick.index,
          liquidityGross: JSBI.BigInt(tick.liquidityGross.toString()),
          liquidityNet: JSBI.BigInt(tick.liquidityNet.toString()),
        }),
    ) ?? [],
  );
}

describe('UniswapV3PriceCalculator', function () {
  this.timeout(15000);
  const network: any = 'goerli';
  const testMarket = '0x56b2Be3730dD9ca5c318390F242650dF5Fa8212b';
  const testAmount = '54475223833788090544753258330903119416';
  /*
  const network: any = 'mainnet'
  const testMarket = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8'
  const testAmount = '53456345673548342346785724359432'
*/

  it('equal prices for contract, sdk, and sync sdk', async function () {
    const endpoint =
      network === 'mainnet'
        ? 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3'
        : 'https://api.thegraph.com/subgraphs/name/ln-e/uniswap-v3-goerli';
    const provider = new providers.InfuraProvider(network, '8ac04e84ff9e4fd19db5bfa857b90a92');
    const factory = new UniswapV3MarketFactory(provider, UNISWAP_V3_FACTORY_ADDRESS, 12380000);
    const syncer = new UniswapV3PoolStateSyncer(10, endpoint);
    const markets = await factory.getEthMarkets();
    const market = markets.find(
      (m) => m.marketAddress.toLowerCase() === testMarket.toLowerCase(),
    ) as UniswapV3Market;
    const quoter = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
    const amount = BigInt(testAmount);
  });

  it('Test saved nangle', async () => {
    const provider = new providers.InfuraProvider(
      NETWORK,
      '8ac04e84ff9e4fd19db5bfa857b90a92',
    ) as providers.JsonRpcProvider;
    const factory = new UniswapV3MarketFactory(provider, UNISWAP_V3_FACTORY_ADDRESS, 12380000);
    const flashbots = await createFlashbotsBundleProvider(provider, NETWORK);
    const executor = new ArbitrageExecutor(
      new FlashbotsTransactionSender(flashbots, provider),
      provider,
      PRIVATE_KEY,
    );
    const triangle = new FixedAmountArbitrageStrategy({}, []);

    const amount = ETHER * 13n;
    const nangle = loadNangle('./test/res/nangle-single-uniswapV3.json');
    const uniswapV3 = nangle.markets[2] as UniswapV3Market;
    const uniswapV2s = [nangle.markets[0], nangle.markets[1]] as UniswapV2Market[];

    const syncerV3 = new UniswapV3PoolStateSyncer(10);
    const syncerV2 = new UniswapV2ReservesSyncer(provider, 10, 1000);

    await syncerV3.syncPoolStates([uniswapV3]);
    await syncerV2.syncReserves(uniswapV2s);
    const opportunity = triangle.calculateOpportunityForAmount(nangle as any, amount, 0)!;

    if (!opportunity) {
      throw new Error('No opportunity');
    }

    const operationV3 = opportunity.operations[2];
    printOpportunity(opportunity);

    const wallet = new Wallet(PRIVATE_KEY);

    const token0Contract = new Contract(uniswapV3.tokens[0], ERC20_ABI, provider);
    const token1Contract = new Contract(uniswapV3.tokens[1], ERC20_ABI, provider);
    console.log(
      `Balance of ${uniswapV3.tokens[0]}: ${(
        await token0Contract.callStatic.balanceOf(uniswapV3.marketAddress)
      )?.toString()}`,
    );
    console.log(
      `Balance of ${uniswapV3.tokens[1]}: ${(
        await token1Contract.callStatic.balanceOf(uniswapV3.marketAddress)
      )?.toString()}`,
    );
    console.log(
      `My Balance of ${uniswapV3.tokens[0]}: ${(
        await token0Contract.callStatic.balanceOf(wallet.address)
      )?.toString()}`,
    );
    console.log(
      `My Balance of ${uniswapV3.tokens[1]}: ${(
        await token1Contract.callStatic.balanceOf(wallet.address)
      )?.toString()}`,
    );
    console.log(`Swap input: ${operationV3.tokenIn} ${operationV3.amountIn?.toString()}`);
    console.log(`Swap output: ${operationV3.tokenOut} ${operationV3.amountOut?.toString()}`);

    console.log(calcPricesWithSyncSdkPool(createSyncSdkPool(uniswapV3), operationV3.amountIn));

    try {
      const uniswapV2 = uniswapV2s[0];
      const uniswapV2contract = new Contract(
        uniswapV2s[0].marketAddress,
        UNISWAP_V2_PAIR_ABI,
        provider,
      );

      const amountIn = 10000000000000000000n;
      const action: any = 'buy';
      let amount0Out =
        action === 'sell' ? BigNumber.from(0) : uniswapV2.calcTokensOut(action, amountIn);
      let amount1Out =
        action === 'sell' ? uniswapV2.calcTokensOut(action, amountIn) : BigNumber.from(0);
      const to = action === 'buy' ? uniswapV2.tokens[1] : uniswapV2.tokens[0];

      const callData = await uniswapV2.performSwap(amountIn, action, wallet.address);
      let populatedTransaction = await UniswapV2Market.uniswapInterface.populateTransaction.swap(
        amount0Out,
        amount1Out,
        wallet.address,
        [],
      );

      console.log([amount0Out?.toString(), amount1Out?.toString(), wallet.address]);

      populatedTransaction = {
        ...populatedTransaction,
        to: uniswapV2.marketAddress,
        from: wallet.address,
        gasLimit: BigNumber.from(5000000),
        gasPrice: await provider.getGasPrice(),
      };

      console.log(populatedTransaction);
      console.log({
        data: callData.data,
        to: uniswapV2.marketAddress,
        fuck: '',
      });
      console.log((await provider.estimateGas(populatedTransaction)).toString());
      /*console.log((await provider.call(populatedTransaction)));
      console.log((await uniswapV2contract.callStatic.swap(
        amount0Out,
        amount1Out,
        wallet.address,
        [],
      )));*/
      const signedBundle = await flashbots.signBundle([
        {
          transaction: populatedTransaction,
          signer: wallet,
        },
      ]);
      console.log(await flashbots.simulate(signedBundle, (await getLastBlockNumber(provider)) + 1));

      /*
            uniswapV2contract.estimateGas.swap(
              amount0Out,
              amount1Out,
              wallet.address,
              [],
            ).estimateGas({
              from: wallet.address,
              gas: 5000000,
              value: BigNumber.from(0)
            }, (error: any, result: any) => {
              console.log(error);
              console.log('swap: ', result);
            });*/

      /*const gas = await getBaseFeePerGas(provider, 0);
      console.log(await executor.simulateOpportunity(opportunity, gas));*/
    } catch (e) {
      console.log(e);
    }
  });
});
