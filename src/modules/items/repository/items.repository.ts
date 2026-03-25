import type { Item } from '../domain/item.model.ts';

export type ItemsRepository = {
  list: () => Item[];
  findById: (id: number) => Item | undefined;
  replaceById: (id: number, item: Item) => boolean;
};
