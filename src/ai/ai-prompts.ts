import { Item } from 'src/types.ts';
import { OpenRouterMessage } from 'src/ai/openrouter-client.ts';

export type AiPromptItem = Pick<
  Item,
  'category' | 'title' | 'description' | 'params'
> & {
  price: number;
};

export type AiChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const BASE_SYSTEM_PROMPT =
  'Ты помогаешь продавцу улучшать объявления. Отвечай только на русском языке, опирайся только на данные объявления, не выдумывай факты и пиши в формате, удобном для интерфейса.';

const DESCRIPTION_TASK_PROMPT =
  'Улучши описание объявления. Если описание пустое, создай новое. Не добавляй неподтверждённые характеристики. Верни только итоговый текст описания без вступления.';

const PRICE_TASK_PROMPT =
  'Оцени одну рекомендуемую цену объявления в рублях и дай короткое объяснение. Не выдавай внешние рыночные данные как достоверный факт и не возвращай лишний формат.';

const CHAT_TASK_PROMPT =
  'Отвечай кратко и по делу на вопросы продавца по объявлению. Учитывай историю диалога. Если вопрос выходит за рамки объявления, прямо скажи об ограничении контекста.';

const toPromptItemPayload = (item: AiPromptItem) => ({
  category: item.category,
  title: item.title,
  description: item.description?.trim() ? item.description : null,
  price: item.price,
  params: item.params,
});

const buildTaskPrompt = (taskPrompt: string, item: AiPromptItem): string =>
  `${taskPrompt}\n\nКонтекст объявления:\n${JSON.stringify(toPromptItemPayload(item), null, 2)}`;

const buildBaseSystemMessage = (): OpenRouterMessage => ({
  role: 'system',
  content: BASE_SYSTEM_PROMPT,
});

export const buildDescriptionPromptMessages = (
  item: AiPromptItem,
): OpenRouterMessage[] => [
  buildBaseSystemMessage(),
  {
    role: 'user',
    content: buildTaskPrompt(DESCRIPTION_TASK_PROMPT, item),
  },
];

export const buildPricePromptMessages = (item: AiPromptItem): OpenRouterMessage[] => [
  buildBaseSystemMessage(),
  {
    role: 'user',
    content: buildTaskPrompt(PRICE_TASK_PROMPT, item),
  },
];

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
