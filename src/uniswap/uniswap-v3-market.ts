import { BigNumber } from 'ethers';
import { Address, CallData, EthMarket, MarketAction } from '../entities';
import { CurrencyAmount, Token } from '@uniswap/sdk-core';
import { ChainId, JSBI } from '@uniswap/sdk';
import { FeeAmount, Pool, Tick } from '@uniswap/v3-sdk';
import { AdvancedPool } from './uniswap-v3-sdk-advanced-pool';

export class UniswapV3Market implements EthMarket {
  readonly protocol = 'uniswapV3';
  public sqrtPrice?: BigNumber;
  public tick?: number;
  public pool?: AdvancedPool;
  private readonly poolToken0: Token;
  private readonly poolToken1: Token;

  constructor(
    readonly marketAddress: Address,
    readonly tokens: [Address, Address],
    readonly fee: number,
    readonly tickSpacing: number,
  ) {
    this.poolToken0 = new Token(ChainId.MAINNET, this.tokens[0], 0);
    this.poolToken1 = new Token(ChainId.MAINNET, this.tokens[1], 0);
  }

  calcTokensOut(action: MarketAction, amountIn: BigNumber): BigNumber | null {
    if (!this.pool) {
      return null;
    }

    try {
      const token = action === 'sell' ? this.poolToken0 : this.poolToken1;
      return BigNumber.from(
        this.pool
          .getOutputAmountSync(
            CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amountIn.toString())),
          )[0]
          .toSignificant(100),
      );
    } catch (e) {
      return null;
    }
  }

  calcTokensIn(action: MarketAction, amountOut: BigNumber): BigNumber | null {
    if (!this.pool) {
      return null;
    }

    try {
      const token = action === 'sell' ? this.poolToken0 : this.poolToken1;
      return BigNumber.from(
        this.pool
          .getInputAmountSync(
            CurrencyAmount.fromRawAmount(token, JSBI.BigInt(amountOut.toString())),
          )[0]
          .toSignificant(100),
      );
    } catch (e) {
      return null;
    }
  }

  performSwap(
    amount: BigNumber,
    action: MarketAction,
    recipient: string | EthMarket,
  ): Promise<CallData> {
    throw new Error('Method not implemented.');
  }

  setPoolState(tick: number, sqrtPriceX96: BigNumber, liquidity: BigNumber, ticks: Tick[]) {
    try {
      this.pool = new AdvancedPool(
        this.poolToken0,
        this.poolToken1,
        this.fee as FeeAmount,
        JSBI.BigInt(sqrtPriceX96.toString()),
        JSBI.BigInt(liquidity.toString()),
        tick,
        ticks,
      );
    } catch (e: any) {
      if (!e?.message?.includes('PRICE_BOUNDS')) {
        console.error(e);
      }
      this.pool = undefined;
    }
  }
}
