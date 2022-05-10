import { ArbitrageOpportunity } from './arbitrage-strategy';
import { BigNumber, PopulatedTransaction } from 'ethers';

export interface SimulatedArbitrageOpportunity extends ArbitrageOpportunity {
  transactionData: PopulatedTransaction;
  amountToCoinbase: BigNumber;
  profitNet: BigNumber;
  gasFees: BigNumber;
}
