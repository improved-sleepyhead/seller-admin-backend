import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import packageJson from '../../../package.json' with { type: 'json' };
import {
  AiChatRequestSchema,
  AiDescriptionRequestSchema,
  AiPriceRequestSchema,
} from 'src/modules/ai/contracts/ai-request.contract.ts';
import {
  AiChatResponseSchema,
  AiDescriptionResponseSchema,
  AiPriceResponseSchema,
  AiStatusResponseSchema,
} from 'src/modules/ai/contracts/ai-response.contract.ts';
import { ItemReadDtoSchema } from 'src/modules/items/contracts/item-read.contract.ts';
import {
  ItemsResponseSchema,
  ItemUpdateSuccessResponseSchema,
} from 'src/modules/items/contracts/item-response.contract.ts';
import {
  ItemPatchInSchema,
  ItemUpdateInSchema,
} from 'src/modules/items/contracts/item-update.contract.ts';
import { ApiErrorResponseSchema } from 'src/shared/contracts/api-error.contract.ts';

type JsonSchema = Record<string, unknown>;

const DOCUMENTATION_ROUTE_PREFIX = '/documentation';

const createSchemaRef = (schemaName: string) => ({
  $ref: `#/components/schemas/${schemaName}`,
});

const toOpenApiSchema = (schema: z.ZodType): JsonSchema => {
  const jsonSchema = z.toJSONSchema(schema) as JsonSchema;

  delete jsonSchema.$schema;

  return jsonSchema;
};

const createJsonResponse = (
  schemaName: string,
  description: string,
): Record<string, unknown> => ({
  description,
  content: {
    'application/json': {
      schema: createSchemaRef(schemaName),
    },
  },
});

const createErrorResponse = (
  description: string,
  example: {
    code: 'VALIDATION_ERROR' | 'NOT_FOUND' | 'AI_UNAVAILABLE' | 'AI_PROVIDER_ERROR';
    message: string;
    details?: unknown;
  },
): Record<string, unknown> => ({
  description,
  content: {
    'application/json': {
      schema: createSchemaRef('ApiErrorResponse'),
      example: {
        success: false,
        code: example.code,
        message: example.message,
        ...(example.details === undefined ? {} : { details: example.details }),
      },
    },
  },
});

const createSwaggerDocument = (): Record<string, unknown> => ({
  openapi: '3.1.0',
  info: {
    title: 'Frontend Trainee Assignment Backend API',
    description:
      'Frontend-facing API contract for items and AI helper endpoints.',
    version: packageJson.version,
  },
  servers: [
    {
      url: '/',
      description: 'Current backend origin',
    },
  ],
  tags: [
    {
      name: 'items',
      description: 'Item list, details, and update endpoints.',
    },
    {
      name: 'ai',
      description: 'Backend-owned AI helper endpoints.',
    },
  ],
  components: {
    schemas: {
      ApiErrorResponse: toOpenApiSchema(ApiErrorResponseSchema),
      ItemReadDto: toOpenApiSchema(ItemReadDtoSchema),
      ItemsResponse: toOpenApiSchema(ItemsResponseSchema),
      ItemPatchIn: toOpenApiSchema(ItemPatchInSchema),
      ItemUpdateIn: toOpenApiSchema(ItemUpdateInSchema),
      ItemUpdateSuccessResponse: toOpenApiSchema(ItemUpdateSuccessResponseSchema),
      AiStatusResponse: toOpenApiSchema(AiStatusResponseSchema),
      AiDescriptionRequest: toOpenApiSchema(AiDescriptionRequestSchema),
      AiDescriptionResponse: toOpenApiSchema(AiDescriptionResponseSchema),
      AiPriceRequest: toOpenApiSchema(AiPriceRequestSchema),
      AiPriceResponse: toOpenApiSchema(AiPriceResponseSchema),
      AiChatRequest: toOpenApiSchema(AiChatRequestSchema),
      AiChatResponse: toOpenApiSchema(AiChatResponseSchema),
    },
  },
  paths: {
    '/items': {
      get: {
        tags: ['items'],
        summary: 'List items',
        description:
          'Returns a backend-filtered, backend-sorted, and backend-paginated item list.',
        parameters: [
          {
            in: 'query',
            name: 'q',
            required: false,
            schema: {
              type: 'string',
            },
            description: 'Full-text search query.',
          },
          {
            in: 'query',
            name: 'limit',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              default: 10,
            },
            description: 'Page size after filtering.',
          },
          {
            in: 'query',
            name: 'skip',
            required: false,
            schema: {
              type: 'integer',
              minimum: 0,
              default: 0,
            },
            description: 'Number of filtered records to skip.',
          },
          {
            in: 'query',
            name: 'categories',
            required: false,
            schema: {
              type: 'string',
              example: 'auto,electronics',
            },
            description: 'Comma-separated category filter.',
          },
          {
            in: 'query',
            name: 'needsRevision',
            required: false,
            schema: {
              type: 'boolean',
              default: false,
            },
            description: 'Revision flag filter. Supports `true` and `1`.',
          },
          {
            in: 'query',
            name: 'sortColumn',
            required: false,
            schema: {
              type: 'string',
              enum: ['title', 'createdAt', 'price'],
            },
            description: 'Sortable column for the item list.',
          },
          {
            in: 'query',
            name: 'sortDirection',
            required: false,
            schema: {
              type: 'string',
              enum: ['asc', 'desc'],
            },
            description: 'Sorting direction.',
          },
        ],
        responses: {
          200: createJsonResponse(
            'ItemsResponse',
            'Frontend-facing item list response.',
          ),
          400: createErrorResponse('Query validation failed.', {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
          }),
        },
      },
    },
    '/items/{id}': {
      get: {
        tags: ['items'],
        summary: 'Get item details',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: {
              type: 'integer',
              minimum: 1,
            },
            description: 'Positive item identifier.',
          },
        ],
        responses: {
          200: createJsonResponse(
            'ItemReadDto',
            'Frontend-facing item details response.',
          ),
          400: createErrorResponse('Path validation failed.', {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
          }),
          404: createErrorResponse('Item was not found.', {
            code: 'NOT_FOUND',
            message: 'Item not found.',
          }),
        },
      },
      patch: {
        tags: ['items'],
        summary: 'Update item',
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: {
              type: 'integer',
              minimum: 1,
            },
            description: 'Positive item identifier.',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: createSchemaRef('ItemPatchIn'),
            },
          },
        },
        responses: {
          200: createJsonResponse(
            'ItemUpdateSuccessResponse',
            'Item update success response.',
          ),
          400: createErrorResponse('Payload or path validation failed.', {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
          }),
          404: createErrorResponse('Item was not found.', {
            code: 'NOT_FOUND',
            message: 'Item not found.',
          }),
        },
      },
    },
    '/api/ai/status': {
      get: {
        tags: ['ai'],
        summary: 'Get AI availability status',
        responses: {
          200: createJsonResponse(
            'AiStatusResponse',
            'AI availability and enabled feature flags.',
          ),
        },
      },
    },
    '/api/ai/description': {
      post: {
        tags: ['ai'],
        summary: 'Generate description suggestion',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: createSchemaRef('AiDescriptionRequest'),
            },
          },
        },
        responses: {
          200: createJsonResponse(
            'AiDescriptionResponse',
            'Normalized AI description suggestion.',
          ),
          400: createErrorResponse('Payload validation failed.', {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
          }),
          502: createErrorResponse('AI provider returned an invalid response.', {
            code: 'AI_PROVIDER_ERROR',
            message: 'Failed to receive a valid response from AI provider.',
          }),
          503: createErrorResponse('AI functionality is unavailable.', {
            code: 'AI_UNAVAILABLE',
            message: 'AI features are currently unavailable.',
          }),
          504: createErrorResponse('AI provider request timed out.', {
            code: 'AI_PROVIDER_ERROR',
            message: 'Failed to receive a valid response from AI provider.',
          }),
        },
      },
    },
    '/api/ai/price': {
      post: {
        tags: ['ai'],
        summary: 'Generate price suggestion',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: createSchemaRef('AiPriceRequest'),
            },
          },
        },
        responses: {
          200: createJsonResponse(
            'AiPriceResponse',
            'Normalized AI price suggestion.',
          ),
          400: createErrorResponse('Payload validation failed.', {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
          }),
          502: createErrorResponse('AI provider returned an invalid response.', {
            code: 'AI_PROVIDER_ERROR',
            message: 'Failed to receive a valid response from AI provider.',
          }),
          503: createErrorResponse('AI functionality is unavailable.', {
            code: 'AI_UNAVAILABLE',
            message: 'AI features are currently unavailable.',
          }),
          504: createErrorResponse('AI provider request timed out.', {
            code: 'AI_PROVIDER_ERROR',
            message: 'Failed to receive a valid response from AI provider.',
          }),
        },
      },
    },
    '/api/ai/chat': {
      post: {
        tags: ['ai'],
        summary: 'Generate AI chat reply',
        description:
          'Returns a Vercel AI SDK UI message stream for `useChat` and `DefaultChatTransport`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: createSchemaRef('AiChatRequest'),
            },
          },
        },
        responses: {
          200: {
            description:
              'AI SDK UI message stream over SSE with `x-vercel-ai-ui-message-stream: v1`.',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                },
                example: [
                  'data: {"type":"start","messageId":"assistant-1"}',
                  '',
                  'data: {"type":"text-start","id":"text-1"}',
                  '',
                  'data: {"type":"text-delta","id":"text-1","delta":"Привет"}',
                  '',
                  'data: {"type":"text-end","id":"text-1"}',
                  '',
                  'data: {"type":"finish","finishReason":"stop"}',
                  '',
                  'data: [DONE]',
                ].join('\n'),
              },
            },
          },
          400: createErrorResponse('Payload validation failed.', {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed.',
          }),
          502: createErrorResponse('AI provider returned an invalid response.', {
            code: 'AI_PROVIDER_ERROR',
            message: 'Failed to receive a valid response from AI provider.',
          }),
          503: createErrorResponse('AI functionality is unavailable.', {
            code: 'AI_UNAVAILABLE',
            message: 'AI features are currently unavailable.',
          }),
          504: createErrorResponse('AI provider request timed out.', {
            code: 'AI_PROVIDER_ERROR',
            message: 'Failed to receive a valid response from AI provider.',
          }),
        },
      },
    },
  },
});

export const registerSwaggerPlugin = async (
  fastify: FastifyInstance,
): Promise<void> => {
  await fastify.register((await import('@fastify/swagger')).default, {
    mode: 'static',
    specification: {
      document: createSwaggerDocument(),
    },
  });

  await fastify.register((await import('@fastify/swagger-ui')).default, {
    routePrefix: DOCUMENTATION_ROUTE_PREFIX,
    staticCSP: true,
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });
};
