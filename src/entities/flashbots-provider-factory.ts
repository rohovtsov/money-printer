import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { providers, Wallet } from 'ethers';
import { Address } from './interfaces/eth-market';
import { hackFlashbotsBundleProviderSigningKey } from './flashbots-provider-signing-key-hack';

export async function createFlashbotsBundleProvider(
  provider: providers.JsonRpcProvider,
  network?: string,
  newSigningKeyPerEachRequest?: boolean,
  flashbotsRelaySigningPrivateKey?: Address | null | undefined,
): Promise<FlashbotsBundleProvider> {
  const rpcUrl =
    network !== 'mainnet'
      ? `https://relay-${network}.flashbots.net`
      : `https://relay.flashbots.net`;

  async function initFlashbots(privateKey: string): Promise<FlashbotsBundleProvider> {
    return await FlashbotsBundleProvider.create(provider, new Wallet(privateKey), rpcUrl, network);
  }

  if (flashbotsRelaySigningPrivateKey) {
    console.log(`Flashbots: using provided signing key ${flashbotsRelaySigningPrivateKey}`);
    return initFlashbots(flashbotsRelaySigningPrivateKey);
  } else if (!newSigningKeyPerEachRequest) {
    const privateKey = Wallet.createRandom().privateKey;
    console.log(`Flashbots: using random signing key ${privateKey}`);
    return initFlashbots(privateKey);
  } else {
    const flashbots = await initFlashbots(Wallet.createRandom().privateKey);
    hackFlashbotsBundleProviderSigningKey(flashbots);
    console.log(`Flashbots: hacked to use new signing key per each request.`);
    return flashbots;
  }
}

export async function createEthermineBundleProvider(
  provider: providers.JsonRpcProvider,
): Promise<FlashbotsBundleProvider> {
  const rpcUrl = 'https://mev-relay.ethermine.org';
  return await FlashbotsBundleProvider.create(provider, Wallet.createRandom(), rpcUrl, 'mainnet');
}
