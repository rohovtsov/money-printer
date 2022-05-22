import { providers } from 'ethers';
import { ALCHEMY_API_KEY, CUSTOM_WS_PROVIDER_URL, INFURA_API_KEY, NETWORK } from './environmet';

type ProviderName = 'CUSTOM_WS' | 'ALCHEMY_WS' | 'INFURA_WS';

interface ProviderWithName {
  provider: providers.WebSocketProvider | null;
  name: ProviderName;
}

const PROVIDERS: ProviderWithName[] = [
  {
    name: 'CUSTOM_WS',
    provider: CUSTOM_WS_PROVIDER_URL
      ? new providers.WebSocketProvider(CUSTOM_WS_PROVIDER_URL, NETWORK)
      : null,
  },
  {
    name: 'ALCHEMY_WS',
    provider: ALCHEMY_API_KEY
      ? new providers.AlchemyWebSocketProvider(NETWORK, ALCHEMY_API_KEY)
      : null,
  },
  {
    name: 'INFURA_WS',
    provider: INFURA_API_KEY
      ? new providers.InfuraWebSocketProvider(NETWORK, INFURA_API_KEY)
      : null,
  },
];

export function getProvider(
  purpose?: string | null,
  excludeNames: ProviderName[] = [],
): providers.WebSocketProvider {
  for (const provider of PROVIDERS) {
    if (excludeNames.includes(provider.name) || !provider.provider) {
      continue;
    }

    if (purpose) {
      console.log(`Using ${provider.name} for ${purpose}`);
    }

    return provider.provider;
  }

  throw new Error(`Provider not found`);
}
