import items from 'data/items.json' with { type: 'json' };

import type { Item } from '../domain/item.model.ts';
import type { ItemsRepository } from './items.repository.ts';

const ITEMS = items as Item[];

export const createInMemoryItemsRepository = (): ItemsRepository => ({
  list: () => ITEMS,
  findById: id => ITEMS.find(item => item.id === id),
  replaceById: (id, nextItem) => {
    const itemIndex = ITEMS.findIndex(item => item.id === id);

    if (itemIndex === -1) {
      return false;
    }

    ITEMS[itemIndex] = nextItem;

    return true;
  },
});
