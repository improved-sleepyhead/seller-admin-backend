import { z } from 'zod';

import { ItemSortColumn, SortDirection } from 'src/modules/items/domain/item.types.ts';
import { ITEM_CATEGORIES } from 'src/shared/constants/item-categories.ts';

const CategorySchema = z.enum(Object.values(ITEM_CATEGORIES));

export const ItemsGetInQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  limit: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional().default(10)),
  skip: z
    .string()
    .optional()
    .transform(val => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(0).optional().default(0)),
  categories: z
    .string()
    .optional()
    .transform(val => (val ? val.split(',').map(s => s.trim()) : undefined))
    .pipe(z.array(CategorySchema).optional()),
  needsRevision: z
    .string()
    .optional()
    .transform(val => {
      if (!val) return undefined;
      return val === 'true' || val === '1';
    })
    .pipe(z.boolean().optional().default(false)),
  sortColumn: z.enum<ItemSortColumn[]>(['title', 'createdAt', 'price']).optional(),
  sortDirection: z.enum<SortDirection[]>(['asc', 'desc']).optional(),
});

export type ItemsGetInQuery = z.infer<typeof ItemsGetInQuerySchema>;
