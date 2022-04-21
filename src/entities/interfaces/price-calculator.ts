import { BigNumber } from 'ethers';

export interface PriceCalculator {
  getTokensIn(reserveIn: BigNumber, reserveOut: BigNumber, amountOut: BigNumber): BigNumber | null;
  getTokensOut(reserveIn: BigNumber, reserveOut: BigNumber, amountIn: BigNumber): BigNumber | null;
}
