import { BigNumber, Contract } from 'ethers';
import {
  Address,
  CallData,
  EthMarket,
  MarketAction,
  PriceCalculator,
  UNISWAP_V2_PAIR_ABI,
  WETH_ADDRESS,
} from '../entities';
import { NativeUniswapV2Calculator } from './uniswap-v2-price-calculator';

export class UniswapV2Market implements EthMarket {
  static uniswapInterface = new Contract(WETH_ADDRESS, UNISWAP_V2_PAIR_ABI);

  readonly protocol = 'uniswapV2';
  private reserves?: [bigint, bigint];
  private cacheOut: Record<string, bigint | null> = {};

  public hasEnoughReserves(tokenAddress: string, minReserve: bigint): boolean {
    if (!this.reserves) {
      return false;
    }
    return this.reserves[this.tokens.indexOf(tokenAddress)] > minReserve;
  }

  constructor(readonly marketAddress: Address, readonly tokens: [Address, Address]) {}

  public getReserve0(): bigint {
    if (!this.reserves) {
      throw new Error('no reserves is set');
    }
    return this.reserves[0];
  }

  public getReserve1(): bigint {
    if (!this.reserves) {
      throw new Error('no reserves is set');
    }
    return this.reserves[1];
  }

  calcTokensOut(action: MarketAction, amountIn: bigint): bigint | null {
    if (!this.reserves) {
      console.log(this.marketAddress);
      throw new Error('Reserves not supplied');
    }

    const cacheKey = `${action}_${amountIn.toString()}`;
    if (!this.cacheOut.hasOwnProperty(cacheKey)) {
      const reservesIn = action === 'sell' ? this.reserves[0] : this.reserves[1];
      const reservesOut = action === 'sell' ? this.reserves[1] : this.reserves[0];
      this.cacheOut[cacheKey] = NativeUniswapV2Calculator.getTokensOut(
        reservesIn,
        reservesOut,
        amountIn,
      );
    }

    return this.cacheOut[cacheKey];
  }

  calcTokensIn(action: MarketAction, amountOut: bigint): bigint | null {
    if (!this.reserves) {
      throw new Error('Reserves not supplied');
    }

    const reservesIn = action === 'sell' ? this.reserves[0] : this.reserves[1];
    const reservesOut = action === 'sell' ? this.reserves[1] : this.reserves[0];

    return NativeUniswapV2Calculator.getTokensIn(reservesIn, reservesOut, amountOut);
  }

  async performSwap(
    amountIn: bigint,
    action: MarketAction,
    recipient: string | EthMarket,
    data: string | [] = [],
  ): Promise<CallData> {
    // function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external lock {
    const toAddress = typeof recipient === 'string' ? recipient : recipient.marketAddress;
    let amount0Out = action === 'sell' ? BigNumber.from(0) : this.calcTokensOut(action, amountIn);
    let amount1Out = action === 'sell' ? this.calcTokensOut(action, amountIn) : BigNumber.from(0);

    const populatedTransaction = await UniswapV2Market.uniswapInterface.populateTransaction.swap(
      amount0Out,
      amount1Out,
      toAddress,
      data,
    );
    if (populatedTransaction === undefined || populatedTransaction.data === undefined) {
      throw new Error('Populated transaction is undefined');
    }
    return {
      data: populatedTransaction.data,
      target: this.marketAddress,
    };
  }

  setTokenReserves(reserves1: bigint, reserves2: bigint): void {
    const oldReserves = [...(this.reserves ?? [])];
    this.reserves = [reserves1, reserves2];
    this.cacheOut = {};

    if (oldReserves.length !== this.reserves.length) {
      console.log(
        `${this.marketAddress} changed reserves size`,
        oldReserves.length,
        'vs',
        this.reserves.length,
      );
    } else if (this.reserves.length) {
      let id = 0;

      if (this.reserves[0] !== oldReserves[0] || this.reserves[1] !== oldReserves[1]) {
        console.log(
          `${this.marketAddress} ${id} changed reserves`,
          oldReserves[0],
          oldReserves[1],
          'vs',
          this.reserves[0],
          this.reserves[1],
        );
      }
    }
  }
}
