import type { OpenRouterMessage } from '../providers/openrouter/openrouter.types.ts';
import { buildBaseSystemMessage } from './base.prompt.ts';
import { AiPromptItem, buildTaskPrompt } from './item-context.prompt.ts';

const DESCRIPTION_TASK_PROMPT =
  'Улучши описание объявления. Если описание пустое, создай новое. Не добавляй неподтверждённые характеристики. Верни только итоговый текст описания без вступления.';

export const buildDescriptionPromptMessages = (
  item: AiPromptItem,
): OpenRouterMessage[] => [
  buildBaseSystemMessage(),
  {
    role: 'user',
    content: buildTaskPrompt(DESCRIPTION_TASK_PROMPT, item),
  },
];
