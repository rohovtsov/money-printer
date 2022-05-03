import { ArbitrageOpportunity } from './interfaces/arbitrage-strategy';
import { Address } from './interfaces/eth-market';
import { WETH_ADDRESS } from './addresses';

const tokenShortNames: Record<Address, string> = {
  [WETH_ADDRESS]: 'WETH',
};

export function tokenShortName(address: Address) {
  return tokenShortNames[address] ?? `Token ${address}`;
}

export function printOpportunity(opp: ArbitrageOpportunity): void {
  let path = `${opp.operations?.[0]?.amountIn}${opp.operations.map(op => ` > ${op.action} > ${op.amountOut}`).join('')}`;
  let tokens = `${opp.operations.map((op => `https://goerli.etherscan.io/token/${op.action === 'sell' ? op.market.tokens[0] : op.market.tokens[1] }`)).join('\n')}`;
  let markets = `${opp.operations.map((op => `https://goerli.etherscan.io/address/${op.market.marketAddress}#readContract`)).join('\n')}`;

  console.log(
    `Type: ${opp.strategyName}\n` +
    `Profit: ${opp.profit.toString()} of ${tokenShortName(opp.startToken)}\n` +
    `Path: ${path}\n` +
    `${tokens}\n` +
    `Markets:\n` +
    `${markets}\n`
  )
}
