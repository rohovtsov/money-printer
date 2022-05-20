import { BigNumber, Contract, providers } from 'ethers';
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

function performanceTest(pool: NativePool, syncPool: SyncSdkPool, amount0: bigint) {
  startTime();
  let output;
  let nativeTime;
  let syncTime;
  let amount = amount0;
  for (let i = 0; i < 100; i++) {
    output = calcPricesWithNativePool(pool, amount);
    amount = amount * 2n;
  }
  console.log('native swap', output?.[0]?.toString(), (nativeTime = endTime()));

  startTime();
  amount = amount0;
  for (let i = 0; i < 100; i++) {
    output = calcPricesWithSyncSdkPool(syncPool, amount);
    amount = amount * 2n;
  }
  console.log('sync sdk', output?.[0]?.toString(), (syncTime = endTime()));
  console.log(`native is faster ${syncTime / nativeTime}`);
}

function testOutputs(pool: NativePool, syncPool: SyncSdkPool, amount: bigint) {
  startTime();
  let outputs0, outputs1;
  for (let i = 0; i < 100; i++) {
    outputs0 = calcPricesWithNativePool(pool, amount);
    outputs1 = calcPricesWithSyncSdkPool(syncPool, amount);
    amount = amount * 2n;

    for (let i = 0; i < 4; i++) {
      expect(outputs0[i]?.toString()).equal(outputs1[i]?.toString());
    }
  }
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
    const token0Contract = new Contract(market.tokens[0], ERC20_ABI, provider);
    const token1Contract = new Contract(market.tokens[1], ERC20_ABI, provider);
    const amount = BigInt(testAmount);

    console.log(
      `Balance of ${market.tokens[0]}: ${(
        await token0Contract.callStatic.balanceOf(market.marketAddress)
      )?.toString()}`,
    );
    console.log(
      `Balance of ${market.tokens[1]}: ${(
        await token1Contract.callStatic.balanceOf(market.marketAddress)
      )?.toString()}`,
    );
    console.log(`Swap amount: ${amount?.toString()}`);

    const contractPrices = await Promise.all([
      quoter.callStatic
        .quoteExactInputSingle(market.tokens[0], market.tokens[1], market.fee, amount.toString(), 0)
        .catch(() => null),
      quoter.callStatic
        .quoteExactInputSingle(market.tokens[1], market.tokens[0], market.fee, amount.toString(), 0)
        .catch(() => null),
      quoter.callStatic
        .quoteExactOutputSingle(
          market.tokens[1],
          market.tokens[0],
          market.fee,
          amount.toString(),
          0,
        )
        .catch(() => null),
      quoter.callStatic
        .quoteExactOutputSingle(
          market.tokens[0],
          market.tokens[1],
          market.fee,
          amount.toString(),
          0,
        )
        .catch(() => null),
      syncer.syncPoolStates([market]),
    ]);

    const nativePool = createNativePool(market);
    const sdkPool = createSdkPool(market);
    const syncSdkPool = createSyncSdkPool(market);
    const syncPrices = calcPricesWithSyncSdkPool(syncSdkPool, amount);
    const nativePrices = calcPricesWithNativePool(nativePool, amount);
    const sdkPrices = await calcPricesWithSdkPool(sdkPool, amount);
    /*
    performanceTest(nativePool, syncSdkPool, amount);
    testOutputs(nativePool, syncSdkPool, amount);
*/

    console.log(contractPrices.slice(0, 4).map((b) => b?.toString()));
    console.log(sdkPrices.map((b: any) => b?.toString()));
    console.log(syncPrices.map((b: any) => b?.toString()));
    console.log(nativePrices.map((b) => b?.toString()));

    for (let i = 0; i < 4; i++) {
      expect(contractPrices[i]?.toString()).equal(sdkPrices[i]?.toString());
      expect(contractPrices[i]?.toString()).equal(syncPrices[i]?.toString());
      expect(contractPrices[i]?.toString()).equal(nativePrices[i]?.toString());
    }
  });
});
