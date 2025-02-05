import {
  ArbitrageOpportunity,
  bigIntToDecimal,
  ERC20_ABI,
  EthMarket,
  MIN_PROFIT_NET,
  MINER_REWORD_PERCENT,
  MONEY_PRINTER_ABI,
  MONEY_PRINTER_ADDRESS,
  MultipleCallData,
  SimulatedArbitrageOpportunity,
  TransactionSender,
  TransactionSimulator,
  WETH_ADDRESS,
} from './entities';
import { Contract, PopulatedTransaction, providers, utils, Wallet } from 'ethers';
import { SimulationResponseSuccess } from '@flashbots/ethers-provider-bundle/src';
import { RelayResponseError } from '@flashbots/ethers-provider-bundle';

export class ArbitrageExecutor {
  private readonly arbitrageSigningWallet;
  readonly moneyPrinterContract;

  constructor(
    readonly simulator: TransactionSimulator,
    readonly senders: TransactionSender[],
    readonly provider: providers.JsonRpcProvider,
    privateKey: string,
  ) {
    this.moneyPrinterContract = new Contract(MONEY_PRINTER_ADDRESS, MONEY_PRINTER_ABI, provider);
    this.arbitrageSigningWallet = new Wallet(privateKey);
  }

  async createRegularSwap(
    callData: MultipleCallData,
    printMoneyContract: Contract,
    ethAmountToCoinbase: bigint,
    gasPrice: bigint,
    gasLimit: bigint,
  ): Promise<PopulatedTransaction> {
    return await printMoneyContract.populateTransaction.printMoney(
      ethAmountToCoinbase,
      callData.targets,
      callData.data,
      {
        gasPrice,
        gasLimit,
      },
    );
  }

  public async createOpportunityTransactionData(
    opportunity: ArbitrageOpportunity,
    ethAmountToCoinbase: bigint,
    gasPrice: bigint,
    gasLimit: bigint,
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
        gasLimit,
      );
    } else {
      transactionData = await this.createRegularSwap(
        callData,
        this.moneyPrinterContract,
        ethAmountToCoinbase,
        gasPrice,
        gasLimit,
      );
    }

    return transactionData;
  }

  private async createSimulatedOpportunity(
    opportunity: ArbitrageOpportunity,
    gasPrice: bigint,
    estimatedGas: bigint,
  ): Promise<SimulatedArbitrageOpportunity> {
    const gasFees = estimatedGas * gasPrice;
    const profitWithoutGasFees = opportunity.profit - gasFees;
    const gasLimit = (estimatedGas * 105n) / 100n + 1n;

    if (gasFees >= opportunity.profit) {
      throw {
        gasFees,
        profitNet: profitWithoutGasFees,
        profit: opportunity.profit,
      };
    }

    const amountToCoinbase = (profitWithoutGasFees * BigInt(MINER_REWORD_PERCENT)) / 100n;
    const profitNet = profitWithoutGasFees - amountToCoinbase;

    if (profitNet <= MIN_PROFIT_NET) {
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
      gasLimit,
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
    gasPrice: bigint,
  ): Promise<SimulatedArbitrageOpportunity> {
    const transactionData = await this.createOpportunityTransactionData(
      opportunity,
      1n,
      gasPrice,
      1000000n,
    );
    let gasUsed: bigint;
    let simOpp: SimulatedArbitrageOpportunity;

    try {
      gasUsed = await this.simulator.simulateTransaction({
        signer: this.arbitrageSigningWallet,
        transactionData: transactionData,
        blockNumber: opportunity.blockNumber + 1,
        opportunity,
      });
    } catch (err: SimulationResponseSuccess | RelayResponseError | any) {
      const revert = err?.firstRevert?.revert ?? err?.firstRevert?.error;
      const error = err?.error ?? (!revert ? err : undefined);

      if (err?.code === 429) {
        //Too many requests, alchemy
        throw { queue: true };
      } else if (error?.body?.startsWith('Too many requests')) {
        throw { queue: true };
      } else {
        console.log(
          `Simulation ${revert ? 'reverted' : 'error'}.`,
          revert,
          error?.toString() ?? error,
        );
      }

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
          `profitNet: ${bigIntToDecimal(err?.profitNet ?? 0n, 18)} ` +
          `profitGross: ${bigIntToDecimal(err?.profit ?? 0n, 18)}, ` +
          `gasFees: ${bigIntToDecimal(err?.gasFees ?? 0n, 18)}, ` +
          `coinbase: ${bigIntToDecimal(err?.amountToCoinbase ?? 0n, 18)}, ` +
          `- at block: ${opportunity.blockNumber}`,
      );
      throw { queue: true };
    }

    console.log(
      `Simulation successful. ` +
        `profitNet: ${bigIntToDecimal(simOpp.profitNet, 18)} ` +
        `profitGross: ${bigIntToDecimal(simOpp.profit, 18)}, ` +
        `gasFees: ${bigIntToDecimal(simOpp.gasFees, 18)}, ` +
        `coinbase: ${bigIntToDecimal(simOpp.amountToCoinbase, 18)}, ` +
        `- at block: ${simOpp.blockNumber}`,
    );

    return simOpp;
  }

  async executeOpportunity(opportunity: SimulatedArbitrageOpportunity): Promise<void> {
    await Promise.all([
      ...this.senders.map((sender) =>
        sender
          .sendTransaction({
            signer: this.arbitrageSigningWallet,
            transactionData: opportunity.transactionData,
            blockNumber: opportunity.blockNumber + 1,
            opportunity,
          })
          .catch((e) => {
            console.log(`Execution error at ${sender.type}.`, e);
          }),
      ),
    ]);
  }
}

function getNextAddress(nextMarket: EthMarket): string {
  if (nextMarket.protocol === 'uniswapV2') {
    return nextMarket.marketAddress;
  }

  return MONEY_PRINTER_ADDRESS;
}
