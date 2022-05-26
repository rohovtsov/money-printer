import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { providers, Wallet } from 'ethers';
import { ALCHEMY_API_KEY, NETWORK } from './entities';

async function getReputation(flashbotsRelaySigningPrivateKey: string) {
  // const provider = new providers.WebSocketProvider('ws://127.0.0.1:8546', NETWORK);
  const provider = new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY);
  const rpcUrl =
    NETWORK !== 'mainnet'
      ? `https://relay-${NETWORK}.flashbots.net`
      : `https://relay.flashbots.net`;
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    new Wallet(flashbotsRelaySigningPrivateKey),
    rpcUrl,
    NETWORK,
  );

  console.log(`User stats:`, await flashbotsProvider.getUserStats());
}

async function getBundleStats(
  flashbotsRelaySigningPrivateKey: string,
  bundleHash: string,
  blockNumber: number,
) {
  // const provider = new providers.WebSocketProvider('ws://127.0.0.1:8546', NETWORK);
  const provider = new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY);
  const rpcUrl =
    NETWORK !== 'mainnet'
      ? `https://relay-${NETWORK}.flashbots.net`
      : `https://relay.flashbots.net`;
  const flashbotsProvider = await FlashbotsBundleProvider.create(
    provider,
    new Wallet(flashbotsRelaySigningPrivateKey),
    rpcUrl,
    NETWORK,
  );

  console.log(`User stats:`, await flashbotsProvider.getBundleStats(bundleHash, blockNumber));
}

// getReputation('0xd6a4ffff3bced79e805b077a9110b3be016bb0b1cf5e8dd4b744fb16caac4ee2');
getBundleStats(
  '0xd6a4ffff3bced79e805b077a9110b3be016bb0b1cf5e8dd4b744fb16caac4ee2',
  '0xafb482c135985dcf126a14fd40743afdb8b65f10471a166c19dbcf8fc5634294',
  14823697,
);
