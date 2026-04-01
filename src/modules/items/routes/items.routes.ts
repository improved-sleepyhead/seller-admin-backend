import type { FastifyInstance, RequestGenericInterface } from 'fastify';

import {
  ItemsGetInQuerySchema,
  type ItemsGetInQuery,
} from '../contracts/items-query.contract.ts';
import {
  ItemPatchInSchema,
  type ItemPatchIn,
} from '../contracts/item-update.contract.ts';
import {
  ItemUpdateSuccessResponseSchema,
  ItemsResponseSchema,
} from '../contracts/item-response.contract.ts';
import { toAdDetailsDto, toItemReadDto } from '../mapper/item.mapper.ts';
import type { ItemsService } from '../service/items.service.ts';

interface ItemGetRequest extends RequestGenericInterface {
  Params: {
    id: string;
  };
}

interface ItemsGetRequest extends RequestGenericInterface {
  Querystring: {
    q?: string;
    limit?: string;
    skip?: string;
    categories?: string;
    needsRevision?: string;
  };
}

interface ItemUpdateRequest extends RequestGenericInterface {
  Params: {
    id: string;
  };
}

export const registerItemRoutes = (
  fastify: FastifyInstance,
  itemsService: ItemsService,
): void => {
  fastify.get<ItemGetRequest>('/items/:id', request => {
    const itemId = itemsService.parseItemId(request.params.id);

    return toAdDetailsDto(itemsService.getItemById(itemId));
  });

  fastify.get<ItemsGetRequest>('/items', request => {
    const query = ItemsGetInQuerySchema.parse(request.query) as ItemsGetInQuery;
    const result = itemsService.listItems(query);

    return ItemsResponseSchema.parse({
      items: result.items.map(toItemReadDto),
      total: result.total,
    });
  });

  fastify.patch<ItemUpdateRequest>('/items/:id', request => {
    const itemId = itemsService.parseItemId(request.params.id);
    const parsedData = ItemPatchInSchema.parse(request.body ?? {}) as ItemPatchIn;

    itemsService.updateItem(itemId, parsedData);

    return ItemUpdateSuccessResponseSchema.parse({ success: true });
  });
};
