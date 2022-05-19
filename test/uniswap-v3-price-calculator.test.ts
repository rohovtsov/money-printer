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

    if (isInput && JSBI.lessThanOrEqual(res?.[1]?.liquidity ?? '0', JSBI.BigInt(0))) {
      return null;
    }

    if (amount <= 0) {
      return null;
    }

    const output = res?.[0]?.toSignificant(100);
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
    pool.getOutputAmount(CurrencyAmount.fromRawAmount(pool.token0, JSBI.BigInt(amount.toString()))),
    pool.getOutputAmount(CurrencyAmount.fromRawAmount(pool.token1, JSBI.BigInt(amount.toString()))),
    pool.getInputAmount(CurrencyAmount.fromRawAmount(pool.token0, JSBI.BigInt(amount.toString()))),
    pool.getInputAmount(CurrencyAmount.fromRawAmount(pool.token1, JSBI.BigInt(amount.toString()))),
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
  const network: any = 'mainnet'; //goerli
  const testMarket = '0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8'; //0x56b2Be3730dD9ca5c318390F242650dF5Fa8212b
  const testAmount = '442535578348252745435545345534'; //mainnet

  it('equal prices for contract, sdk, and sync sdk', async function () {
    const endpoint =
      network === 'mainnet'
        ? 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3'
        : 'https://api.thegraph.com/subgraphs/name/ln-e/uniswap-v3-goerli';
    const provider = new providers.InfuraProvider('mainnet', '8ac04e84ff9e4fd19db5bfa857b90a92');
    const factory = new UniswapV3MarketFactory(provider, UNISWAP_V3_FACTORY_ADDRESS, 12380000);
    const syncer = new UniswapV3PoolStateSyncer(provider, 10, endpoint);
    const markets = await factory.getEthMarkets();

    const market = markets.find(
      (m) => m.marketAddress.toLowerCase() === testMarket.toLowerCase(),
    ) as UniswapV3Market;
    const quoter = new Contract(UNISWAP_V3_QUOTER_ADDRESS, UNISWAP_V3_QUOTER_ABI, provider);
    const amount = BigInt(testAmount);

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

    //saveMarket('sample-market.json', market);
    const nativePool = createNativePool(market);
    const sdkPool = createSdkPool(market);
    const syncSdkPool = createSyncSdkPool(market);
    const syncPrices = calcPricesWithSyncSdkPool(syncSdkPool, amount);
    const nativePrices = calcPricesWithNativePool(nativePool, amount);
    const sdkPrices = await calcPricesWithSdkPool(sdkPool, amount);

    performanceTest(nativePool, syncSdkPool, amount);
    testOutputs(nativePool, syncSdkPool, amount);

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

/*
Profit: -99999304748229172238 of WETH
Path: 100000000000000000000 > buy > 33563660622520811881271 > sell > 2095574 > sell > 695251770827762
https://etherscan.io/token/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
https://etherscan.io/token/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984
https://etherscan.io/token/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
Markets:
https://etherscan.io/address/0x1d42064Fc4Beb5F8aAF85F4617AE8b3b5B8Bd801#readContract
https://etherscan.io/address/0xE845469aAe04f8823202b011A848cf199420B4C1#readContract
https://etherscan.io/address/0x7BeA39867e4169DBe237d55C8242a8f2fcDcc387#readContract
*/

//0x56b2Be3730dD9ca5c318390F242650dF5Fa8212b#readContract

function saveMarket(fileName: string, market: UniswapV3Market): void {
  fs.writeFileSync(
    fileName,
    JSON.stringify(
      {
        ticks: (market?.pool?.ticks ?? []).map((tick: any) => ({
          index: tick.index,
          liquidityGross: tick.liquidityGross.toString(),
          liquidityNet: tick.liquidityNet.toString(),
        })),
        token1: market!.tokens[1],
        token0: market!.tokens[0],
        fee: market.fee,
        tick: market!.pool!.tickCurrent,
        sqrtRatioX96: market!.pool!.sqrtRatioX96.toString(),
        liquidity: market!.pool!.liquidity.toString(),
      },
      null,
      2,
    ),
  );
}
