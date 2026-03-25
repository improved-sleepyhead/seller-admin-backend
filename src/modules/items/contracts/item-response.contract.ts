import { z } from 'zod';

import { ItemReadDtoSchema } from './item-read.contract.ts';

export const ItemsResponseSchema = z.strictObject({
  items: z.array(ItemReadDtoSchema),
  total: z.number().int().min(0),
});

export const ItemUpdateSuccessResponseSchema = z.strictObject({
  success: z.literal(true),
});
