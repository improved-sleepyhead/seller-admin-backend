import { z } from 'zod';
import { ITEM_CATEGORIES } from './constants.ts';
import { ItemSortColumn, SortDirection } from './types.ts';

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

const parseOptionalIntegerQueryParam = (value: unknown): unknown => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return value;
  }

  return Number(value);
};

const parseOptionalCategoriesQueryParam = (value: unknown): unknown => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const categories = value.split(',').map(part => part.trim()).filter(Boolean);

  return categories.length ? categories : undefined;
};

const parseOptionalBooleanQueryParam = (value: unknown): unknown => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  return value;
};

export const ItemsGetInQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  limit: z.preprocess(
    parseOptionalIntegerQueryParam,
    z.number().int().positive().optional().default(10),
  ),
  skip: z.preprocess(
    parseOptionalIntegerQueryParam,
    z.number().int().min(0).optional().default(0),
  ),
  categories: z.preprocess(
    parseOptionalCategoriesQueryParam,
    z.array(CategorySchema).optional(),
  ),
  needsRevision: z.preprocess(
    parseOptionalBooleanQueryParam,
    z.boolean().optional().default(false),
  ),
  sortColumn: z.enum<ItemSortColumn[]>(['title', 'createdAt', 'price']).optional(),
  sortDirection: z.enum<SortDirection[]>(['asc', 'desc']).optional(),
});

export const ItemUpdateInSchema = z
  .object({
    category: CategorySchema,
    title: z.string(),
    description: z.string().optional(),
    price: z.number().min(0),
  })
  .and(
    z.discriminatedUnion('category', [
      z.object({
        category: z.literal(ITEM_CATEGORIES.AUTO),
        params: AutoItemParamsSchema.partial(),
      }),
      z.object({
        category: z.literal(ITEM_CATEGORIES.REAL_ESTATE),
        params: RealEstateItemParamsSchema.partial(),
      }),
      z.object({
        category: z.literal(ITEM_CATEGORIES.ELECTRONICS),
        params: ElectronicsEstateItemParamsSchema.partial(),
      }),
    ]),
  );
