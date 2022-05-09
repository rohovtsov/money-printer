import { ArbitrageOpportunity } from './arbitrage-strategy';
import { BigNumber, PopulatedTransaction } from 'ethers';

export interface SimulatedArbitrageOpportunity extends ArbitrageOpportunity {
  transactionData: PopulatedTransaction;
  gasUsed: BigNumber;
  profitNet: BigNumber;
}
