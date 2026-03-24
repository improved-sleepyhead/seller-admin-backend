import type { Item } from 'src/modules/items/domain/item.model.ts';

export type AiPromptItem = Pick<
  Item,
  'category' | 'title' | 'description' | 'params'
> & {
  price: number;
};

const toPromptItemPayload = (item: AiPromptItem) => ({
  category: item.category,
  title: item.title,
  description: item.description?.trim() ? item.description : null,
  price: item.price,
  params: item.params,
});

export const buildTaskPrompt = (taskPrompt: string, item: AiPromptItem): string =>
  `${taskPrompt}\n\nКонтекст объявления:\n${JSON.stringify(toPromptItemPayload(item), null, 2)}`;
