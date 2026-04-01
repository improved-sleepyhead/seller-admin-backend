import type { ItemsGetInQuery } from 'src/modules/items/contracts/items-query.contract.ts';
import {
  AutoItemParamsSchema,
  ElectronicsEstateItemParamsSchema,
  RealEstateItemParamsSchema,
  type ItemPatchIn,
} from 'src/modules/items/contracts/item-update.contract.ts';
import type { Item } from 'src/modules/items/domain/item.model.ts';
import { doesItemNeedRevision } from 'src/modules/items/domain/item-revision.ts';
import { notFoundError, validationError } from 'src/shared/errors/app-error.ts';

import type { ItemsRepository } from '../repository/items.repository.ts';

const getCategoryParamsSchemas = (category: Item['category']) => {
  if (category === 'auto') {
    return {
      full: AutoItemParamsSchema,
      partial: AutoItemParamsSchema.partial(),
    };
  }

  if (category === 'real_estate') {
    return {
      full: RealEstateItemParamsSchema,
      partial: RealEstateItemParamsSchema.partial(),
    };
  }

  return {
    full: ElectronicsEstateItemParamsSchema,
    partial: ElectronicsEstateItemParamsSchema.partial(),
  };
};

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

  updateItem(itemId: number, parsedData: ItemPatchIn): void {
    const existingItem = this.getItemById(itemId);
    const nextCategory = parsedData.category ?? existingItem.category;
    const categoryChanged =
      parsedData.category !== undefined && parsedData.category !== existingItem.category;

    if (categoryChanged && parsedData.params === undefined) {
      throw validationError(
        'params should be provided as a full category-specific payload when category changes.',
      );
    }

    const nextCategoryParamsSchemas = getCategoryParamsSchemas(nextCategory);
    const validatedPatchParams =
      parsedData.params === undefined
        ? undefined
        : categoryChanged
          ? nextCategoryParamsSchemas.full.parse(parsedData.params)
          : nextCategoryParamsSchemas.partial.parse(parsedData.params);
    const nextParams =
      validatedPatchParams === undefined
        ? existingItem.params
        : categoryChanged
          ? validatedPatchParams
          : { ...existingItem.params, ...validatedPatchParams };
    const nextItem: Item = {
      id: existingItem.id,
      createdAt: existingItem.createdAt,
      updatedAt: new Date().toISOString(),
      category: nextCategory,
      title: parsedData.title === undefined ? existingItem.title : parsedData.title,
      description:
        parsedData.description === undefined
          ? existingItem.description
          : parsedData.description,
      price: parsedData.price === undefined ? existingItem.price : parsedData.price,
      params: nextParams,
    };

    itemsRepository.replaceById(itemId, nextItem);
  },
});

export type ItemsService = ReturnType<typeof createItemsService>;
