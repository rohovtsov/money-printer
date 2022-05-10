import { NETWORK } from './environmet';
import { ArbitrageOpportunity } from './interfaces/arbitrage-strategy';
import { Address } from './interfaces/eth-market';
import { WETH_ADDRESS } from './addresses';
import { bigNumberToDecimal } from './utils';
import { SimulatedArbitrageOpportunity } from './interfaces/arbitrage-execution';

const tokenShortNames: Record<Address, string> = {
  [WETH_ADDRESS]: 'WETH',
};

export function tokenShortName(address: Address) {
  return tokenShortNames[address] ?? `Token ${address}`;
}

export function printOpportunity(opp: ArbitrageOpportunity): void {
  const simOpp = opp as SimulatedArbitrageOpportunity;
  let path = `${opp.operations?.[0]?.amountIn}${opp.operations
    .map((op) => ` > ${op.action} > ${op.amountOut}`)
    .join('')}`;
  let tokens = `${opp.operations
    .map(
      (op) =>
        `https://${NETWORK !== 'mainnet' ? 'www' : NETWORK}.etherscan.io/token/${
          op.action === 'sell' ? op.market.tokens[0] : op.market.tokens[1]
        }`,
    )
    .join('\n')}`;
  let markets = `${opp.operations
    .map(
      (op) =>
        `https://${NETWORK !== 'mainnet' ? 'www' : NETWORK}.etherscan.io/address/${
          op.market.marketAddress
        }#readContract (${op.market.protocol} ${op.action})`,
    )
    .join('\n')}`;

  console.log(
    `Type: ${opp.strategyName}\n` +
      `Profit: ${bigNumberToDecimal(opp.profit, 18)} of ${tokenShortName(opp.startToken)}\n` +
      `${
        simOpp?.profitNet
          ? `Profit Net: ${bigNumberToDecimal(simOpp.profitNet, 18)} of ${tokenShortName(
              opp.startToken,
            )}\n`
          : ``
      }` +
      `Path: ${path}\n` +
      `${tokens}\n` +
      `Markets:\n` +
      `${markets}\n`,
  );
}
