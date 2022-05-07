import {
  ArbitrageOpportunity, ERC20_ABI, EthMarket, MINER_REWORD_PERCENT,
  MONEY_PRINTER_ABI, MONEY_PRINTER_ADDRESS,
  MultipleCallData,
  TransactionSender,
  USE_FLASHBOTS, WETH_ADDRESS
} from './entities';
import { BigNumber, Contract, PopulatedTransaction, providers, utils, Wallet } from 'ethers';



export class ArbitrageExecutor {
  private readonly arbitrageSigningWallet;
  readonly moneyPrinterContract;

  constructor(
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
  ): Promise<PopulatedTransaction> {
    const nonce = await this.provider.getTransactionCount(this.arbitrageSigningWallet.address);
    const transaction = await printMoneyContract.populateTransaction.printMoney(
      ethAmountToCoinbase,
      callData.targets,
      callData.data,
      {
        nonce: nonce,
        gasPrice: await this.provider.getGasPrice(),
        gasLimit: BigNumber.from(4000000),
      },
    );
    return transaction;
  }

  async executeOpportunity(
    opportunity: ArbitrageOpportunity,
    sender: TransactionSender,
  ): Promise<void> {
    const callData: MultipleCallData = { data: [], targets: [] };

    let lowMoney = true; // TODO: check if we have enough money
    let ethAmountToCoinbase = USE_FLASHBOTS ? opportunity.profit.mul(MINER_REWORD_PERCENT).div(100) : BigNumber.from(0);

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

    console.log('callData is collected', callData);
    try {
      let transactionData;

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
        );
      } else {
        transactionData = await this.createRegularSwap(
          callData,
          this.moneyPrinterContract,
          ethAmountToCoinbase,
        );
      }

      const receipt = await sender.sendTransaction({
        signer: this.arbitrageSigningWallet,
        transactionData,
        blockNumber: opportunity.blockNumber + 1,
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
