import type { Item } from '../domain/item.model.ts';
import { doesItemNeedRevision } from '../domain/item-revision.ts';
import { ItemReadDtoSchema, type ItemReadDto } from '../contracts/item-read.contract.ts';

const createReadItemDtoInput = (item: Item) => ({
  id: item.id,
  category: item.category,
  title: item.title,
  description: item.description,
  price: item.price,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  previewImage: item.previewImage,
  images: item.images,
  params: item.params,
  needsRevision: doesItemNeedRevision(item),
});

export type AdDetailsDto = ItemReadDto;

export const toItemReadDto = (item: Item): ItemReadDto =>
  ItemReadDtoSchema.parse(createReadItemDtoInput(item));

export const toAdDetailsDto = toItemReadDto;
