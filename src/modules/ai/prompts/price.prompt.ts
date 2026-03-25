import type { OpenRouterMessage } from '../providers/openrouter/openrouter.types.ts';
import { buildBaseSystemMessage } from './base.prompt.ts';
import { AiPromptItem, buildTaskPrompt } from './item-context.prompt.ts';

const PRICE_TASK_PROMPT =
  'Оцени одну рекомендуемую цену объявления в рублях и дай короткое объяснение. Не выдавай внешние рыночные данные как достоверный факт и не возвращай лишний формат.';

export const buildPricePromptMessages = (
  item: AiPromptItem,
): OpenRouterMessage[] => [
  buildBaseSystemMessage(),
  {
    role: 'user',
    content: buildTaskPrompt(PRICE_TASK_PROMPT, item),
  },
];
