// @ts-nocheck

import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { Wallet } from 'ethers';
import { FlashbotsOptions, FlashbotsTransaction } from '@flashbots/ethers-provider-bundle/src';

/*
  private async request(request: string) {
    const connectionInfo = { ...this.connectionInfo }

    connectionInfo.headers = {
      'X-Flashbots-Signature': `${await this.authSigner.getAddress()}:${await this.authSigner.signMessage(id(request))}`,
      ...this.connectionInfo.headers
    }
    return fetchJson(connectionInfo, request)
  }
*/

/*
public async sendRawBundle(
  signedBundledTransactions: Array<string>,
  targetBlockNumber: number,
  opts?: FlashbotsOptions
): Promise<FlashbotsTransaction> {
*/

export function hackFlashbotsBundleProviderSigningKey(flashbotsProvider: FlashbotsBundleProvider) {
  /*flashbotsProvider.request = function (requestParam: string) {
    flashbotsProvider.authSigner = Wallet.createRandom();
    console.log(`FlashbotsProvider: signing key changed ${flashbotsProvider.authSigner.privateKey}`);
    return FlashbotsBundleProvider.prototype.request.call(flashbotsProvider, requestParam);
  }*/

  flashbotsProvider.sendRawBundle = function (
    signedBundledTransactions: Array<string>,
    targetBlockNumber: number,
    opts?: FlashbotsOptions,
  ) {
    flashbotsProvider.authSigner = Wallet.createRandom();
    console.log(
      `FlashbotsProvider signing key changed before sending: ${flashbotsProvider.authSigner.privateKey}`,
    );
    return FlashbotsBundleProvider.prototype.sendRawBundle.call(
      flashbotsProvider,
      signedBundledTransactions,
      targetBlockNumber,
      opts,
    );
  };
}
