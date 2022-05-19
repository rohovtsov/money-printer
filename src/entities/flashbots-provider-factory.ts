import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { providers, Wallet } from 'ethers';
import { Address } from './interfaces/eth-market';

export async function createFlashbotsBundleProvider(
  provider: providers.JsonRpcProvider,
  network?: string,
  flashbotsRelaySigningPrivateKey?: Address | null | undefined,
): Promise<FlashbotsBundleProvider> {
  let privateKey: Address;

  if (flashbotsRelaySigningPrivateKey) {
    privateKey = flashbotsRelaySigningPrivateKey;
    console.log(`Flashbots: using signing key ${privateKey}`);
  } else {
    privateKey = Wallet.createRandom().privateKey;
    console.log(
      `Flashbots: creating random signing key, this flashbots searcher will not be building a reputation for next run`,
    );
  }

  const rpcUrl =
    network !== 'mainnet'
      ? `https://relay-${network}.flashbots.net`
      : `https://relay.flashbots.net`;
  const wallet = new Wallet(privateKey);
  console.log(`Flashbots reputation key: ${privateKey}`);

  return FlashbotsBundleProvider.create(provider, wallet, rpcUrl, network);
}
