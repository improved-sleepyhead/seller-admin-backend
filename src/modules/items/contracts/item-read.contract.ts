import { z } from 'zod';

import type { Item } from 'src/modules/items/domain/item.model.ts';

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const ImageUrlSchema = z.string().url();

const optionalReadField = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

const AutoReadItemParamsSchema = z.object({
  brand: optionalReadField(z.string().min(1)),
  model: optionalReadField(z.string().min(1)),
  yearOfManufacture: optionalReadField(z.number().int().positive()),
  transmission: optionalReadField(z.enum(['automatic', 'manual'])),
  mileage: optionalReadField(z.number().positive()),
  enginePower: optionalReadField(z.number().int().positive()),
});

const RealEstateReadItemParamsSchema = z.object({
  type: optionalReadField(z.enum(['flat', 'house', 'room'])),
  address: optionalReadField(z.string().min(1)),
  area: optionalReadField(z.number().positive()),
  floor: optionalReadField(z.number().int().positive()),
});

const ElectronicsReadItemParamsSchema = z.object({
  type: optionalReadField(z.enum(['phone', 'laptop', 'misc'])),
  brand: optionalReadField(z.string().min(1)),
  model: optionalReadField(z.string().min(1)),
  condition: optionalReadField(z.enum(['new', 'used'])),
  color: optionalReadField(z.string().min(1)),
});

const createReadItemSchema = <TCategory extends Item['category']>(
  category: TCategory,
  paramsSchema: z.ZodType,
) =>
  z.strictObject({
    id: z.number().int().positive(),
    category: z.literal(category),
    title: z.string().min(1),
    description: z.string().optional(),
    price: z.number().finite().min(0),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    previewImage: optionalReadField(ImageUrlSchema),
    images: optionalReadField(z.array(ImageUrlSchema).min(1)),
    params: paramsSchema,
    needsRevision: z.boolean().optional(),
  });

const AutoReadItemDtoSchema = createReadItemSchema('auto', AutoReadItemParamsSchema);
const RealEstateReadItemDtoSchema = createReadItemSchema(
  'real_estate',
  RealEstateReadItemParamsSchema,
);
const ElectronicsReadItemDtoSchema = createReadItemSchema(
  'electronics',
  ElectronicsReadItemParamsSchema,
);

export const ItemReadDtoSchema = z.discriminatedUnion('category', [
  AutoReadItemDtoSchema,
  RealEstateReadItemDtoSchema,
  ElectronicsReadItemDtoSchema,
]);

export type ItemReadDto = z.infer<typeof ItemReadDtoSchema>;
