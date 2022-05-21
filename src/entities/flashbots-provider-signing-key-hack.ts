// @ts-nocheck

import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { Wallet } from 'ethers';
import { FlashbotsOptions, FlashbotsTransaction } from '@flashbots/ethers-provider-bundle/src';
import { id } from 'ethers/lib/utils';
import { fetchJson } from '@ethersproject/web';

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

export function hackFlashbotsBundleProviderSigningKey(
  flashbotsProvider: FlashbotsBundleProvider,
): void {
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

export function hackFlashbotsBundleProviderToLogServerTimestampDifference(
  flashbotsProvider: FlashbotsBundleProvider,
): void {
  flashbotsProvider.request = function (requestParam: string) {
    const isSendRawBundle = requestParam.includes(`"method":"eth_sendBundle"`);

    if (isSendRawBundle) {
      const connectionInfo = { ...flashbotsProvider.connectionInfo };

      return (async () => {
        connectionInfo.headers = {
          'X-Flashbots-Signature': `${await flashbotsProvider.authSigner.getAddress()}:${await flashbotsProvider.authSigner.signMessage(
            id(requestParam),
          )}`,
          ...flashbotsProvider.connectionInfo.headers,
        };

        return fetchJson(connectionInfo, requestParam, (body, response) => {
          const headersDate = response?.headers?.date;

          if (headersDate) {
            const headersTimestamp = new Date(headersDate).getTime();
            const currentTimestamp = Date.now();
            console.log(
              'Flashbots time difference',
              headersTimestamp,
              currentTimestamp,
              currentTimestamp - headersTimestamp,
            );
          }
          return body;
        });
      })();
    } else {
      return FlashbotsBundleProvider.prototype.request.call(flashbotsProvider, requestParam);
    }
  };
}
