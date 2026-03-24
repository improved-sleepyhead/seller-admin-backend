import { z } from 'zod';
import { INPUT_LIMITS } from './constants.ts';
import type { Item } from './types.ts';

const ApiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'AI_UNAVAILABLE',
  'AI_PROVIDER_ERROR',
  'INTERNAL_ERROR',
]);

const IsoDateTimeSchema = z.string().datetime({ offset: true });

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

export const ItemsResponseSchema = z.strictObject({
  items: z.array(ItemReadDtoSchema),
  total: z.number().int().min(0),
});

export const ItemUpdateSuccessResponseSchema = z.strictObject({
  success: z.literal(true),
});

export const ApiErrorResponseSchema = z.strictObject({
  success: z.literal(false),
  code: ApiErrorCodeSchema,
  message: z.string().min(1),
  details: z.unknown().optional(),
});

const OpenRouterUsageSchema = z
  .object({
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
    totalTokens: z.number().int().min(0).optional(),
  })
  .refine(
    usage =>
      usage.inputTokens !== undefined ||
      usage.outputTokens !== undefined ||
      usage.totalTokens !== undefined,
    {
      message: 'At least one usage counter must be present.',
    },
  );

export const AiStatusResponseSchema = z.strictObject({
  enabled: z.boolean(),
  provider: z.literal('openrouter').nullable(),
  model: z.string().nullable(),
  features: z.strictObject({
    description: z.boolean(),
    price: z.boolean(),
    chat: z.boolean(),
  }),
});

export const AiDescriptionResponseSchema = z.strictObject({
  suggestion: z.string().trim().min(1).max(INPUT_LIMITS.item.descriptionMaxLength),
  model: z.string().min(1).optional(),
  usage: OpenRouterUsageSchema.optional(),
});

export const AiPriceResponseSchema = z.strictObject({
  suggestedPrice: z.number().finite().min(0),
  reasoning: z.string().trim().min(1).max(INPUT_LIMITS.ai.priceReasoningMaxLength),
  currency: z.literal('RUB'),
  model: z.string().min(1).optional(),
  usage: OpenRouterUsageSchema.optional(),
});

export const AiChatResponseSchema = z.strictObject({
  message: z.strictObject({
    role: z.literal('assistant'),
    content: z.string().trim().min(1).max(INPUT_LIMITS.item.descriptionMaxLength),
  }),
  model: z.string().min(1).optional(),
  usage: OpenRouterUsageSchema.optional(),
});

export const AiChatStreamEventSchema = z.discriminatedUnion('event', [
  z.strictObject({
    event: z.literal('meta'),
    data: z.strictObject({
      model: z.string().min(1),
    }),
  }),
  z.strictObject({
    event: z.literal('chunk'),
    data: z.strictObject({
      content: z.string().min(1),
    }),
  }),
  z.strictObject({
    event: z.literal('done'),
    data: z
      .strictObject({
        model: z.string().min(1).optional(),
        usage: OpenRouterUsageSchema.optional(),
      })
      .refine(event => event.model !== undefined || event.usage !== undefined, {
        message: 'Done event should include model or usage.',
      }),
  }),
  z.strictObject({
    event: z.literal('error'),
    data: ApiErrorResponseSchema,
  }),
]);

export type ItemReadDto = z.infer<typeof ItemReadDtoSchema>;
