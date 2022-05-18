import { createFlashbotsBundleProvider, NETWORK } from './entities';
import { BigNumber, providers, Wallet } from 'ethers';
import { ethers } from 'ethers';
import { TransactionRequest } from '@ethersproject/abstract-provider';
import { fromNewBlockEvent } from './arbitrage-runner';
import { take } from 'rxjs';
import { FlashbotsTransactionResponse } from '@flashbots/ethers-provider-bundle/src';
const { toChecksumAddress } = require('ethereum-checksum-address');

export async function sendSelfTransaction(
  provider: providers.WebSocketProvider,
  signingWallet: Wallet,
) {
  fromNewBlockEvent(provider)
    .pipe(take(1))
    .subscribe(async (event) => {
      const flashBots = await createFlashbotsBundleProvider(provider, NETWORK);

      const transaction: TransactionRequest = {
        gasLimit: BigNumber.from(30000),
        gasPrice: (await provider.getGasPrice()).div(100),
        to: signingWallet.address,
        value: ethers.utils.parseUnits('0.00001', 'ether'),
        chainId: 1,
      };

      const signedTransaction = await flashBots.signBundle([
        {
          transaction,
          signer: signingWallet,
        },
      ]);

      const bundle = (await flashBots.sendRawBundle(
        signedTransaction,
        event.blockNumber + 1,
      )) as FlashbotsTransactionResponse;
      console.log(bundle);
      console.log(bundle.bundleHash);
      const stats = await flashBots.getBundleStats(bundle.bundleHash, event.blockNumber + 1);
    });
}
