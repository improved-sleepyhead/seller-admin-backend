import type { AiChatHistoryMessage } from '../contracts/ai-request.contract.ts';
import type { OpenRouterMessage } from '../providers/openrouter/openrouter.types.ts';
import { buildBaseSystemMessage } from './base.prompt.ts';
import { AiPromptItem, buildTaskPrompt } from './item-context.prompt.ts';

const CHAT_TASK_PROMPT =
  'Отвечай кратко и по делу на вопросы продавца по объявлению. Учитывай историю диалога. Если вопрос выходит за рамки объявления, прямо скажи об ограничении контекста.';

export const buildChatPromptMessages = ({
  item,
  messages,
  userMessage,
}: {
  item: AiPromptItem;
  messages: AiChatHistoryMessage[];
  userMessage: string;
}): OpenRouterMessage[] => [
  buildBaseSystemMessage(),
  {
    role: 'user',
    content: buildTaskPrompt(CHAT_TASK_PROMPT, item),
  },
  ...messages,
  {
    role: 'user',
    content: userMessage,
  },
];
