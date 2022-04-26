import { Tick } from '@uniswap/v3-sdk';
import { BigNumber } from 'ethers';

export interface PoolState {
  ticks: Tick[];
  tick: number;
  sqrtPriceX96: BigNumber;
  liquidity: BigNumber;
}
