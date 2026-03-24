import type { OpenRouterClient } from '../providers/openrouter/openrouter.types.ts';

export const getAiStatusResponse = (openRouterClient: OpenRouterClient) => ({
  enabled: openRouterClient.enabled,
  provider: openRouterClient.enabled ? openRouterClient.provider : null,
  model: openRouterClient.enabled ? openRouterClient.model : null,
  features: {
    description: openRouterClient.enabled,
    price: openRouterClient.enabled,
    chat: openRouterClient.enabled,
  },
});
