import type { OpenRouterMessage } from '../providers/openrouter/openrouter.types.ts';

const BASE_SYSTEM_PROMPT =
  'Ты помогаешь продавцу улучшать объявления. Отвечай только на русском языке, опирайся только на данные объявления, не выдумывай факты и пиши в формате, удобном для интерфейса.';

export const buildBaseSystemMessage = (): OpenRouterMessage => ({
  role: 'system',
  content: BASE_SYSTEM_PROMPT,
});
