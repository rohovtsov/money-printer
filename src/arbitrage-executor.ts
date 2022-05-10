import {
  ArbitrageOpportunity,
  bigNumberToDecimal,
  ERC20_ABI,
  EthMarket,
  MINER_REWORD_PERCENT,
  MONEY_PRINTER_ABI,
  MONEY_PRINTER_ADDRESS,
  MultipleCallData,
  SimulatedArbitrageOpportunity,
  TransactionSender,
  USE_FLASHBOTS,
  WETH_ADDRESS,
} from './entities';
import { BigNumber, Contract, PopulatedTransaction, providers, utils, Wallet } from 'ethers';

export class ArbitrageExecutor {
  private readonly arbitrageSigningWallet;
  readonly moneyPrinterContract;

  constructor(
    readonly sender: TransactionSender,
    readonly provider: providers.JsonRpcProvider,
    privateKey: string,
  ) {
    this.moneyPrinterContract = new Contract(MONEY_PRINTER_ADDRESS, MONEY_PRINTER_ABI, provider);
    this.arbitrageSigningWallet = new Wallet(privateKey);
  }

  async createRegularSwap(
    callData: MultipleCallData,
    printMoneyContract: Contract,
    ethAmountToCoinbase: BigNumber,
    gasPrice: BigNumber,
  ): Promise<PopulatedTransaction> {
    return await printMoneyContract.populateTransaction.printMoney(
      ethAmountToCoinbase,
      callData.targets,
      callData.data,
      {
        gasPrice,
        gasLimit: BigNumber.from(600000),
      },
    );
  }

  private async createOpportunityTransactionData(
    opportunity: ArbitrageOpportunity,
    ethAmountToCoinbase: BigNumber,
    gasPrice: BigNumber,
  ): Promise<PopulatedTransaction> {
    const callData: MultipleCallData = { data: [], targets: [] };

    let lowMoney = true; // TODO: check if we have enough money

    for (let i = 0; i < opportunity.operations.length; i++) {
      const currentOperation = opportunity.operations[i];
      const nextOperation = opportunity.operations[i + 1];

      // pre first step operations
      if (i === 0) {
        if (lowMoney) {
          // flashloan swap
          if (currentOperation.market.protocol === 'uniswapV2') {
            // выполняем флеш займ в конце всех шагов, т.к. он упаковывает в себя их дату
            const trans = await new Contract(
              currentOperation.tokenOut,
              ERC20_ABI,
              //TODO: точно нужен provider?
              this.provider,
            ).populateTransaction.transfer(
              getNextAddress(nextOperation.market),
              currentOperation.amountOut,
            );

            if (!trans || !trans.data) {
              throw new Error('Failed to populate transaction 4');
            }

            callData.data.push(trans.data);
            callData.targets.push(currentOperation.tokenOut);
            continue;
          } else {
            // кажется что для v3 не нужны дополнительные шаги
            // throw new Error('flash swap on v3 is not implemented yet');
            continue;
          }
        } else {
          // regular swap
          // move weth to the first v2 market
          if (currentOperation.market.protocol === 'uniswapV2') {
            const transaction = await new Contract(
              WETH_ADDRESS,
              ERC20_ABI,
              //TODO: точно нужен provider?
              this.provider,
            ).populateTransaction.transfer(
              currentOperation.market.marketAddress,
              opportunity.operations[0].amountIn,
            );
            if (!transaction || !transaction.data) {
              throw new Error('Failed to populate transaction 1');
            }
            callData.data.push(transaction.data);
            callData.targets.push(WETH_ADDRESS);
          } else {
            // для v3 для обычного свопа нет необходимости переводить weth, он будет выплачен внутри коллбека
          }
        }
      }

      const data = await currentOperation.market.performSwap(
        currentOperation.amountIn,
        currentOperation.action,
        !nextOperation || nextOperation.market.protocol === 'uniswapV3'
          ? this.moneyPrinterContract.address
          : nextOperation.market,
        [],
      );
      callData.data.push(data.data);
      callData.targets.push(data.target);
    }

    let transactionData: PopulatedTransaction;

    if (lowMoney) {
      const firstOperation = opportunity.operations[0];
      const abiCoder = new utils.AbiCoder();
      const data = abiCoder.encode(
        ['uint256', 'address[]', 'bytes[]'],
        [opportunity.operations[0].amountIn, callData.targets, callData.data],
      );
      const loanTransaction = await firstOperation.market.performSwap(
        firstOperation.amountIn,
        firstOperation.action,
        MONEY_PRINTER_ADDRESS,
        data,
      );

      if (!loanTransaction || !loanTransaction.data) {
        throw new Error('Failed to populate transaction 5');
      }

      transactionData = await this.createRegularSwap(
        { data: [loanTransaction.data], targets: [firstOperation.market.marketAddress] },
        this.moneyPrinterContract,
        ethAmountToCoinbase,
        gasPrice,
      );
    } else {
      transactionData = await this.createRegularSwap(
        callData,
        this.moneyPrinterContract,
        ethAmountToCoinbase,
        gasPrice,
      );
    }

    return transactionData;
  }

  private async createSimulatedOpportunity(
    opportunity: ArbitrageOpportunity,
    gasPrice: BigNumber,
    estimatedGas: BigNumber,
  ): Promise<SimulatedArbitrageOpportunity> {
    const gasFees = estimatedGas.mul(gasPrice);

    if (gasFees.gte(opportunity.profit)) {
      throw {
        gasFees,
        profit: opportunity.profit,
      };
    }

    const profitWithoutGasFees = opportunity.profit.sub(gasFees);
    const amountToCoinbase = profitWithoutGasFees.mul(MINER_REWORD_PERCENT).div(100);
    const profitNet = profitWithoutGasFees.sub(amountToCoinbase);

    if (profitNet.lte(BigNumber.from(0))) {
      throw {
        gasFees,
        amountToCoinbase,
        profitNet,
        profit: opportunity.profit,
      };
    }

    const transactionData = await this.createOpportunityTransactionData(
      opportunity,
      amountToCoinbase,
      gasPrice,
    );

    return {
      ...opportunity,
      profitNet,
      transactionData,
      amountToCoinbase,
      gasFees,
    };
  }

  async simulateOpportunity(
    opportunity: ArbitrageOpportunity,
    gasPrice: BigNumber,
  ): Promise<SimulatedArbitrageOpportunity> {
    const transactionData = await this.createOpportunityTransactionData(
      opportunity,
      BigNumber.from(0),
      gasPrice,
    );
    let gasUsed: BigNumber;
    let simOpp: SimulatedArbitrageOpportunity;

    try {
      gasUsed = await this.sender.simulateTransaction({
        signer: this.arbitrageSigningWallet,
        transactionData: transactionData,
        blockNumber: opportunity.blockNumber + 1,
        opportunity,
      });
    } catch (err: any) {
      const revert = err?.firstRevert?.revert;
      const error = err?.error;
      console.log(`Simulation ${revert ? 'reverted' : 'error'}. `, revert, error);

      if (error?.message?.startsWith('err: max fee per gas less')) {
        throw { queue: true };
      }

      if (error?.message?.startsWith('err: insufficient funds for gas')) {
        throw { die: true };
      }

      throw { queue: false };
    }

    try {
      simOpp = await this.createSimulatedOpportunity(opportunity, gasPrice, gasUsed);
    } catch (err: any) {
      console.log(
        `Simulation unprofitable. ` +
          `profitNet: ${bigNumberToDecimal(err?.profitNet ?? BigNumber.from(0), 18)} ` +
          `profitGross: ${bigNumberToDecimal(err?.profit ?? BigNumber.from(0), 18)}, ` +
          `gasFees: ${bigNumberToDecimal(err?.gasFees ?? BigNumber.from(0), 18)}, ` +
          `coinbase: ${bigNumberToDecimal(err?.amountToCoinbase ?? BigNumber.from(0), 18)}, ` +
          `- at block: ${opportunity.blockNumber}`,
      );
      throw { queue: true };
    }

    console.log(
      `Simulation successful. ` +
        `profitNet: ${bigNumberToDecimal(simOpp.profitNet, 18)} ` +
        `profitGross: ${bigNumberToDecimal(simOpp.profit, 18)}, ` +
        `gasFees: ${bigNumberToDecimal(simOpp.gasFees, 18)}, ` +
        `coinbase: ${bigNumberToDecimal(simOpp.amountToCoinbase, 18)}, ` +
        `- at block: ${simOpp.blockNumber}`,
    );

    return simOpp;
  }

  async executeOpportunity(opportunity: SimulatedArbitrageOpportunity): Promise<void> {
    try {
      const receipt = await this.sender.sendTransaction({
        signer: this.arbitrageSigningWallet,
        transactionData: opportunity.transactionData,
        blockNumber: opportunity.blockNumber + 1,
        opportunity,
      });

      console.log('result is', receipt);
    } catch (e) {
      console.log('error is', e);
    }
  }
}

function getNextAddress(nextMarket: EthMarket): string {
  if (nextMarket.protocol === 'uniswapV2') {
    return nextMarket.marketAddress;
  }

  return MONEY_PRINTER_ADDRESS;
}
