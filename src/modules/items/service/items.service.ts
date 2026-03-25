import type { ItemsGetInQuery } from 'src/modules/items/contracts/items-query.contract.ts';
import type { ItemUpdateIn } from 'src/modules/items/contracts/item-update.contract.ts';
import type { Item } from 'src/modules/items/domain/item.model.ts';
import { doesItemNeedRevision } from 'src/modules/items/domain/item-revision.ts';
import { notFoundError, validationError } from 'src/shared/errors/app-error.ts';

import type { ItemsRepository } from '../repository/items.repository.ts';

export const createItemsService = (itemsRepository: ItemsRepository) => ({
  parseItemId(rawItemId: string): number {
    const itemId = Number(rawItemId);

    if (!Number.isInteger(itemId) || itemId < 0) {
      throw validationError('Item ID path param should be a number.');
    }

    return itemId;
  },

  getItemById(itemId: number): Item {
    const item = itemsRepository.findById(itemId);

    if (!item) {
      throw notFoundError("Item with requested id doesn't exist.");
    }

    return item;
  },

  listItems(query: ItemsGetInQuery): { items: Item[]; total: number } {
    const filteredItems = itemsRepository.list().filter(item => {
      return (
        item.title.toLowerCase().includes(query.q.toLowerCase()) &&
        (!query.needsRevision || doesItemNeedRevision(item)) &&
        (!query.categories?.length ||
          query.categories.some(category => item.category === category))
      );
    });

    return {
      items: filteredItems
        .toSorted((item1, item2) => {
          let comparisonValue = 0;

          if (!query.sortDirection) return comparisonValue;

          if (query.sortColumn === 'title') {
            comparisonValue = item1.title.localeCompare(item2.title);
          } else if (query.sortColumn === 'createdAt') {
            comparisonValue =
              new Date(item1.createdAt).valueOf() -
              new Date(item2.createdAt).valueOf();
          } else if (query.sortColumn === 'price') {
            comparisonValue = (item1.price ?? 0) - (item2.price ?? 0);
          }

          return (query.sortDirection === 'desc' ? -1 : 1) * comparisonValue;
        })
        .slice(query.skip, query.skip + query.limit),
      total: filteredItems.length,
    };
  },

  updateItem(itemId: number, parsedData: ItemUpdateIn): void {
    const existingItem = this.getItemById(itemId);

    itemsRepository.replaceById(itemId, {
      id: existingItem.id,
      createdAt: existingItem.createdAt,
      updatedAt: new Date().toISOString(),
      ...parsedData,
    });
  },
});

export type ItemsService = ReturnType<typeof createItemsService>;
