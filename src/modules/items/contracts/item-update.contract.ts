import { z } from 'zod';

import { ITEM_CATEGORIES } from 'src/shared/constants/item-categories.ts';
import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';

const NonEmptyTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(INPUT_LIMITS.item.titleMaxLength);

const OptionalDescriptionSchema = z
  .string()
  .max(INPUT_LIMITS.item.descriptionMaxLength)
  .optional();

const AutoTransmissionSchema = z.enum(['automatic', 'manual']);

export const AutoItemParamsSchema = z.strictObject({
  brand: z.string().nonempty(),
  model: z.string().nonempty(),
  yearOfManufacture: z.number().int().positive(),
  transmission: AutoTransmissionSchema,
  mileage: z.number().positive(),
  enginePower: z.number().int().positive(),
});

const RealEstateTypeSchema = z.enum(['flat', 'house', 'room']);

export const RealEstateItemParamsSchema = z.strictObject({
  type: RealEstateTypeSchema,
  address: z.string().nonempty(),
  area: z.number().positive(),
  floor: z.number().int().positive(),
});

const ElectronicsTypeSchema = z.enum(['phone', 'laptop', 'misc']);
const ElectronicsConditionSchema = z.enum(['new', 'used']);

export const ElectronicsEstateItemParamsSchema = z.strictObject({
  type: ElectronicsTypeSchema,
  brand: z.string().nonempty(),
  model: z.string().nonempty(),
  condition: ElectronicsConditionSchema,
  color: z.string().nonempty(),
});

const CategorySchema = z.enum(Object.values(ITEM_CATEGORIES));

export const ItemUpdateInSchema = z
  .object({
    category: CategorySchema,
    title: NonEmptyTitleSchema,
    description: OptionalDescriptionSchema,
    price: z.number().min(0),
  })
  .and(
    z.discriminatedUnion('category', [
      z.object({
        category: z.literal(ITEM_CATEGORIES.AUTO),
        params: AutoItemParamsSchema,
      }),
      z.object({
        category: z.literal(ITEM_CATEGORIES.REAL_ESTATE),
        params: RealEstateItemParamsSchema,
      }),
      z.object({
        category: z.literal(ITEM_CATEGORIES.ELECTRONICS),
        params: ElectronicsEstateItemParamsSchema,
      }),
    ]),
  );

const ItemPatchParamsSchema = z.union([
  AutoItemParamsSchema.partial(),
  RealEstateItemParamsSchema.partial(),
  ElectronicsEstateItemParamsSchema.partial(),
]);

export const ItemPatchInSchema = z
  .strictObject({
    category: CategorySchema.optional(),
    title: NonEmptyTitleSchema.optional(),
    description: OptionalDescriptionSchema,
    price: z.number().min(0).optional(),
    params: ItemPatchParamsSchema.optional(),
  })
  .refine(
    patch => Object.values(patch).some(value => value !== undefined),
    'At least one field should be provided for PATCH /items/:id.',
  );

export const AiItemInputSchema = ItemUpdateInSchema;

export type ItemUpdateIn = z.infer<typeof ItemUpdateInSchema>;
export type ItemPatchIn = z.infer<typeof ItemPatchInSchema>;
