import type { Item } from './types.ts';
import { doesItemNeedRevision } from './utils.ts';

export type AdDetailsDto = {
  id: number;
  category: Item['category'];
  title: string;
  description?: string;
  price: number | null;
  createdAt: string;
  updatedAt: string;
  params: Item['params'];
  needsRevision?: boolean;
};

export const toAdDetailsDto = (item: Item): AdDetailsDto => ({
  id: item.id,
  category: item.category,
  title: item.title,
  description: item.description,
  price: item.price,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  params: item.params,
  needsRevision: doesItemNeedRevision(item),
});
