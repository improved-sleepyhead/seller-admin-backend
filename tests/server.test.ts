import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import items from 'data/items.json' with { type: 'json' };
import {
  DEFAULT_DEV_CORS_ALLOWED_ORIGINS,
  config,
} from 'src/shared/config/app-config.ts';
import { AiChatResponseSchema } from 'src/modules/ai/contracts/ai-response.contract.ts';
import { AiDescriptionResponseSchema } from 'src/modules/ai/contracts/ai-response.contract.ts';
import { AiPriceResponseSchema } from 'src/modules/ai/contracts/ai-response.contract.ts';
import { AiStatusResponseSchema } from 'src/modules/ai/contracts/ai-response.contract.ts';
import { AiChatStreamEventSchema } from 'src/modules/ai/contracts/ai-stream.contract.ts';
import { ItemReadDtoSchema } from 'src/modules/items/contracts/item-read.contract.ts';
import {
  ItemsResponseSchema,
  ItemUpdateSuccessResponseSchema,
} from 'src/modules/items/contracts/item-response.contract.ts';
import { ApiErrorResponseSchema } from 'src/shared/contracts/api-error.contract.ts';
import { buildApp } from 'src/app/build-app.ts';
import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';

const validAiPayload = {
  item: items[0],
};

const validAiChatPayload = {
  item: items[0],
  messages: [
    {
      role: 'assistant',
      content: 'Здравствуйте. Уточните, что для вас важнее: цена или состояние?',
    },
    {
      role: 'user',
      content: 'Скорее состояние и прозрачная история.',
    },
  ],
  userMessage: 'Сформулируй короткий ответ для покупателя про состояние машины.',
};

const invalidJsonPayload = '{"item":';

const createMockResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
  });

const createMockSseResponse = (
  chunks: string[],
  init?: ResponseInit,
): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }

        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
      ...init,
    },
  );

const readResponseStream = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();

  assert.ok(reader);

  const decoder = new TextDecoder();
  let body = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();

  return body;
};

const waitForCondition = async (
  predicate: () => boolean,
  timeoutMs = 1500,
): Promise<void> => {
  const startedAt = Date.now();

  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for the expected condition.');
    }

    await new Promise(resolve => setTimeout(resolve, 10));
  }
};

const parseSseEvents = (
  rawBody: string,
): Array<{ event: string; data: Record<string, unknown> }> =>
  rawBody
    .split('\n\n')
    .map(frame => frame.trim())
    .filter(Boolean)
    .map(frame => {
      let event = 'message';
      let data = '';

      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          data += `${data ? '\n' : ''}${line.slice('data:'.length).trimStart()}`;
        }
      }

      return {
        event,
        data: JSON.parse(data) as Record<string, unknown>,
      };
    });

const createLogCapture = () => {
  const stream = new PassThrough();
  const chunks: string[] = [];

  stream.on('data', chunk => {
    chunks.push(chunk.toString());
  });

  return {
    stream,
    getRawOutput: () => chunks.join(''),
    getEntries: () =>
      chunks
        .join('')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>),
  };
};

test('request logs keep item query values out of the logged endpoint', async t => {
  const logs = createLogCapture();
  const app = await buildApp({
    logger: {
      stream: logs.stream,
    },
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/items?q=private-search-token&limit=1',
  });

  assert.equal(response.statusCode, 200);

  const rawLogs = logs.getRawOutput();
  const entries = logs.getEntries();
  const requestLog = entries.find(
    entry =>
      typeof entry.msg === 'string' &&
      entry.msg.includes('incoming request'),
  );

  assert.ok(requestLog);
  assert.deepEqual(requestLog.req, {
    method: 'GET',
    endpoint: '/items',
  });
  assert.equal(rawLogs.includes('private-search-token'), false);
  assert.equal(rawLogs.includes('/items?q=private-search-token&limit=1'), false);
});

test('default CORS config uses explicit localhost dev origins instead of wildcard', () => {
  assert.equal(DEFAULT_DEV_CORS_ALLOWED_ORIGINS.includes('http://localhost:5173'), true);
  assert.equal(DEFAULT_DEV_CORS_ALLOWED_ORIGINS.includes('http://127.0.0.1:5173'), true);
  assert.equal(DEFAULT_DEV_CORS_ALLOWED_ORIGINS.includes('*'), false);
});

test('Swagger JSON exposes the documented frontend-facing routes', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/documentation/json',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type']?.includes('application/json'), true);

  const body = response.json() as Record<string, unknown>;
  const paths = body.paths as Record<string, unknown>;
  const components = body.components as Record<string, unknown>;

  assert.equal(body.openapi, '3.1.0');
  assert.ok(paths['/items']);
  assert.ok(paths['/items/{id}']);
  assert.ok(paths['/api/ai/status']);
  assert.ok(paths['/api/ai/description']);
  assert.ok(paths['/api/ai/price']);
  assert.ok(paths['/api/ai/chat']);
  assert.ok((components.schemas as Record<string, unknown>).ApiErrorResponse);

  const aiDescriptionResponses = (
    paths['/api/ai/description'] as {
      post?: {
        responses?: Record<string, { content?: Record<string, { example?: { code?: string } }> }>;
      };
    }
  ).post?.responses;

  assert.equal(
    aiDescriptionResponses?.['502']?.content?.['application/json']?.example?.code,
    'AI_PROVIDER_ERROR',
  );
  assert.equal(
    aiDescriptionResponses?.['503']?.content?.['application/json']?.example?.code,
    'AI_UNAVAILABLE',
  );
  assert.equal(
    aiDescriptionResponses?.['504']?.content?.['application/json']?.example?.code,
    'AI_PROVIDER_ERROR',
  );
});

test('Swagger UI serves the documentation page', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/documentation/',
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type']?.includes('text/html'), true);
  assert.equal(response.body.includes('Swagger UI'), true);
  assert.equal(response.body.includes('./static/swagger-initializer.js'), true);
});

test('CORS allowlist returns headers for an explicitly allowed origin', async t => {
  const originalAllowedOrigins = [...config.cors.allowedOrigins];
  config.cors.allowedOrigins = ['http://localhost:5173'];

  const app = await buildApp();

  t.after(async () => {
    config.cors.allowedOrigins = originalAllowedOrigins;
    await app.close();
  });

  const response = await app.inject({
    method: 'OPTIONS',
    url: '/items/1',
    headers: {
      Origin: 'http://localhost:5173',
      'Access-Control-Request-Method': 'PUT',
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(
    response.headers['access-control-allow-origin'],
    'http://localhost:5173',
  );
  assert.equal(
    response.headers['access-control-allow-methods'],
    'GET,PUT,POST,OPTIONS',
  );
  assert.equal(response.headers['access-control-allow-headers'], 'Content-Type');
  assert.equal(response.headers.vary, 'Origin');
});

test('CORS allowlist skips headers for a disallowed origin', async t => {
  const originalAllowedOrigins = [...config.cors.allowedOrigins];
  config.cors.allowedOrigins = ['http://localhost:5173'];

  const app = await buildApp();

  t.after(async () => {
    config.cors.allowedOrigins = originalAllowedOrigins;
    await app.close();
  });

  const response = await app.inject({
    method: 'OPTIONS',
    url: '/items/1',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'PUT',
    },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], undefined);
  assert.equal(response.headers['access-control-allow-methods'], undefined);
  assert.equal(response.headers['access-control-allow-headers'], undefined);
});

test('item endpoints return normalized DTOs that are safe for runtime validation', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const listResponse = await app.inject({
    method: 'GET',
    url: '/items?limit=30&skip=0',
  });

  assert.equal(listResponse.statusCode, 200);

  const listBody = ItemsResponseSchema.parse(listResponse.json());
  const legacyListItem = listBody.items.find(item => item.id === 8);

  assert.ok(legacyListItem);
  assert.deepEqual(legacyListItem.params, {
    brand: 'Lada',
    model: 'Niva',
    transmission: 'automatic',
  });

  const detailResponse = await app.inject({
    method: 'GET',
    url: '/items/8',
  });

  assert.equal(detailResponse.statusCode, 200);

  const detailBody = ItemReadDtoSchema.parse(detailResponse.json());

  assert.deepEqual(detailBody.params, legacyListItem.params);
});

test('GET /items and GET /items/:id expose optional image fields when present', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const listResponse = await app.inject({
    method: 'GET',
    url: '/items?limit=30&skip=0',
  });

  assert.equal(listResponse.statusCode, 200);

  const listBody = ItemsResponseSchema.parse(listResponse.json());
  const imageListItem = listBody.items.find(item => item.id === 2);
  const legacyListItem = listBody.items.find(item => item.id === 1);

  assert.ok(imageListItem);
  assert.ok(legacyListItem);
  assert.equal(imageListItem.previewImage, 'https://cdn.example.com/items/2/preview.jpg');
  assert.deepEqual(imageListItem.images, [
    'https://cdn.example.com/items/2/1.jpg',
    'https://cdn.example.com/items/2/2.jpg',
  ]);
  assert.equal(legacyListItem.previewImage, undefined);
  assert.equal(legacyListItem.images, undefined);

  const detailResponse = await app.inject({
    method: 'GET',
    url: '/items/2',
  });

  assert.equal(detailResponse.statusCode, 200);

  const detailBody = ItemReadDtoSchema.parse(detailResponse.json());

  assert.equal(detailBody.previewImage, imageListItem.previewImage);
  assert.deepEqual(detailBody.images, imageListItem.images);
});

test('PUT /items/:id returns the stable success DTO', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'PUT',
    url: '/items/1',
    payload: {
      category: 'auto',
      title: 'Почти новая Mitsubishi Lancer',
      description: '',
      price: 300000,
      params: {
        brand: 'Mitsubishi',
        model: 'Lancer',
        yearOfManufacture: 2005,
        transmission: 'automatic',
        mileage: 200000,
        enginePower: 98,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    ItemUpdateSuccessResponseSchema.parse(response.json()),
    { success: true },
  );
});

test('GET /api/ai/status returns a runtime-validatable response in disabled and enabled states', async t => {
  const originalAiConfig = structuredClone(config.ai);

  config.ai = {
    ...originalAiConfig,
    enabled: false,
    provider: null,
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: null,
    },
  };

  const disabledApp = await buildApp();

  t.after(async () => {
    config.ai = originalAiConfig;
    await disabledApp.close();
  });

  const disabledResponse = await disabledApp.inject({
    method: 'GET',
    url: '/api/ai/status',
  });

  assert.equal(disabledResponse.statusCode, 200);
  assert.deepEqual(
    AiStatusResponseSchema.parse(disabledResponse.json()),
    {
      enabled: false,
      provider: null,
      model: null,
      features: {
        description: false,
        price: false,
        chat: false,
      },
    },
  );

  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
      model: 'openrouter/test-model',
    },
  };

  const enabledApp = await buildApp();

  t.after(async () => {
    await enabledApp.close();
  });

  const enabledResponse = await enabledApp.inject({
    method: 'GET',
    url: '/api/ai/status',
  });

  assert.equal(enabledResponse.statusCode, 200);

  const enabledBody = AiStatusResponseSchema.parse(enabledResponse.json());

  assert.equal(enabledBody.enabled, true);
  assert.equal(enabledBody.provider, 'openrouter');
  assert.equal(enabledBody.model, 'openrouter/test-model');
  assert.deepEqual(enabledBody.features, {
    description: true,
    price: true,
    chat: true,
  });
});

test('AI logs contain safe metadata without secrets or user content', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const logs = createLogCapture();
  const responses = [
    createMockResponse({
      id: 'gen-description',
      model: 'openrouter/test-model',
      usage: {
        prompt_tokens: 21,
        completion_tokens: 9,
        total_tokens: 30,
      },
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestion: 'Нормализованное описание без лишних деталей.',
            }),
          },
        },
      ],
    }),
    createMockResponse(
      {
        error: {
          message: 'provider-debug-secret-should-not-be-logged',
        },
      },
      {
        status: 500,
      },
    ),
  ];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => responses.shift() as Response) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp({
    logger: {
      stream: logs.stream,
    },
  });

  t.after(async () => {
    await app.close();
  });

  const privatePayload = {
    item: {
      ...items[0],
      title: 'private-item-title-token',
      description: 'private-item-description-token',
    },
  };

  const successResponse = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: privatePayload,
  });

  const failedResponse = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: privatePayload,
  });

  assert.equal(successResponse.statusCode, 200);
  assert.equal(failedResponse.statusCode, 502);

  const rawLogs = logs.getRawOutput();
  const entries = logs.getEntries();
  const successLog = entries.find(
    entry => entry.msg === 'OpenRouter request completed.',
  );
  const upstreamFailureLog = entries.find(
    entry => entry.msg === 'OpenRouter request returned an upstream error.',
  );
  const apiFailureLog = entries.find(
    entry =>
      entry.msg === 'Failed to receive a valid response from AI provider.' &&
      entry.code === 'AI_PROVIDER_ERROR',
  );

  assert.ok(successLog);
  assert.equal(successLog.endpoint, '/api/ai/description');
  assert.equal(successLog.model, 'openrouter/test-model');
  assert.equal(successLog.status, 200);
  assert.deepEqual(successLog.usage, {
    inputTokens: 21,
    outputTokens: 9,
    totalTokens: 30,
  });

  assert.ok(upstreamFailureLog);
  assert.equal(upstreamFailureLog.endpoint, '/api/ai/description');
  assert.equal(upstreamFailureLog.model, originalAiConfig.openrouter.model);
  assert.equal(upstreamFailureLog.status, 500);

  assert.ok(apiFailureLog);
  assert.equal(apiFailureLog.endpoint, '/api/ai/description');
  assert.equal(apiFailureLog.code, 'AI_PROVIDER_ERROR');
  assert.equal('err' in apiFailureLog, false);

  assert.equal(rawLogs.includes('test-openrouter-key'), false);
  assert.equal(rawLogs.includes('private-item-title-token'), false);
  assert.equal(rawLogs.includes('private-item-description-token'), false);
  assert.equal(rawLogs.includes('provider-debug-secret-should-not-be-logged'), false);
});

test('AI endpoints return AI_UNAVAILABLE when AI config is disabled', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: false,
    provider: null,
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: null,
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: validAiPayload,
  });

  assert.equal(response.statusCode, 503);
  assert.equal(ApiErrorResponseSchema.parse(response.json()).code, 'AI_UNAVAILABLE');
});

test('POST /api/ai/description returns normalized suggestion for empty description', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  let capturedRequestBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    assert.match(requestUrl, /\/chat\/completions$/);
    capturedRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return createMockResponse({
      id: 'gen-description',
      model: 'openrouter/test-model',
      usage: {
        prompt_tokens: 21,
        completion_tokens: 9,
        total_tokens: 30,
      },
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestion:
                'Продаю ухоженную Mitsubishi Lancer с прозрачной историей и аккуратным салоном. Машина готова к просмотру и повседневной эксплуатации.',
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: {
      item: {
        ...items[0],
        description: '',
      },
    },
  });

  assert.equal(response.statusCode, 200);

  const body = AiDescriptionResponseSchema.parse(response.json());

  assert.equal(
    body.suggestion,
    'Продаю ухоженную Mitsubishi Lancer с прозрачной историей и аккуратным салоном. Машина готова к просмотру и повседневной эксплуатации.',
  );
  assert.equal(body.model, 'openrouter/test-model');
  assert.deepEqual(body.usage, {
    inputTokens: 21,
    outputTokens: 9,
    totalTokens: 30,
  });

  const responseFormat = capturedRequestBody?.response_format as
    | { type?: string }
    | undefined;

  assert.equal(responseFormat?.type, 'json_schema');
  assert.equal(
    capturedRequestBody?.max_tokens,
    INPUT_LIMITS.ai.completionMaxTokens.description,
  );
});

test('AI endpoints return AI_PROVIDER_ERROR when provider response cannot be normalized', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    createMockResponse({
      id: 'gen-bad-description',
      model: 'openrouter/test-model',
      choices: [
        {
          message: {
            content: '',
          },
        },
      ],
    })) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: validAiPayload,
  });

  assert.equal(response.statusCode, 502);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).code,
    'AI_PROVIDER_ERROR',
  );
});

test('AI transport errors with a code are normalized to AI_PROVIDER_ERROR', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    const error = new Error('socket hang up') as Error & { code: string };
    error.code = 'ECONNRESET';
    throw error;
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: validAiPayload,
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(ApiErrorResponseSchema.parse(response.json()), {
    success: false,
    code: 'AI_PROVIDER_ERROR',
    message: 'Failed to receive a valid response from AI provider.',
  });
});

test('POST /api/ai/description returns VALIDATION_ERROR for invalid payload', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: {},
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).code,
    'VALIDATION_ERROR',
  );
});

test('POST /api/ai/description returns VALIDATION_ERROR for malformed JSON', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    headers: {
      'content-type': 'application/json',
    },
    payload: invalidJsonPayload,
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(ApiErrorResponseSchema.parse(response.json()), {
    success: false,
    code: 'VALIDATION_ERROR',
    message: "Body is not valid JSON but content-type is set to 'application/json'",
  });
});

test('POST /api/ai/price returns normalized suggested price and reasoning', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  let capturedRequestBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    capturedRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return createMockResponse({
      id: 'gen-price',
      model: 'openrouter/test-model',
      usage: {
        prompt_tokens: 34,
        completion_tokens: 12,
        total_tokens: 46,
      },
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestedPrice: 495000,
              reasoning:
                'Цена выглядит уместной для категории и текущего состояния. Сумма остаётся близкой к исходной и понятной для покупателя.',
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/price',
    payload: validAiPayload,
  });

  assert.equal(response.statusCode, 200);

  const body = AiPriceResponseSchema.parse(response.json());

  assert.equal(body.suggestedPrice, 495000);
  assert.equal(typeof body.suggestedPrice, 'number');
  assert.equal(body.currency, 'RUB');
  assert.match(body.reasoning, /Цена выглядит уместной/);
  assert.equal(body.model, 'openrouter/test-model');
  assert.deepEqual(body.usage, {
    inputTokens: 34,
    outputTokens: 12,
    totalTokens: 46,
  });

  const responseFormat = capturedRequestBody?.response_format as
    | { type?: string }
    | undefined;

  assert.equal(responseFormat?.type, 'json_schema');
  assert.equal(
    capturedRequestBody?.max_tokens,
    INPUT_LIMITS.ai.completionMaxTokens.price,
  );
});

test('POST /api/ai/price returns AI_PROVIDER_ERROR for invalid provider response', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    createMockResponse({
      id: 'gen-bad-price',
      model: 'openrouter/test-model',
      choices: [
        {
          message: {
            content: JSON.stringify({
              suggestedPrice: 'примерно как сейчас',
              reasoning: '',
            }),
          },
        },
      ],
    })) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/price',
    payload: validAiPayload,
  });

  assert.equal(response.statusCode, 502);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).code,
    'AI_PROVIDER_ERROR',
  );
});

test('POST /api/ai/chat returns normalized assistant message', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  let capturedRequestBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    capturedRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

    return createMockResponse({
      id: 'gen-chat',
      model: 'openrouter/test-model',
      usage: {
        prompt_tokens: 55,
        completion_tokens: 18,
        total_tokens: 73,
      },
      choices: [
        {
          message: {
            content: JSON.stringify({
              message: {
                role: 'assistant',
                content:
                  'Состояние можно описать как аккуратное: автомобиль обслуживался, салон чистый, история понятная.',
              },
            }),
          },
        },
      ],
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/chat',
    payload: validAiChatPayload,
  });

  assert.equal(response.statusCode, 200);

  const body = AiChatResponseSchema.parse(response.json());

  assert.deepEqual(body.message, {
    role: 'assistant',
    content:
      'Состояние можно описать как аккуратное: автомобиль обслуживался, салон чистый, история понятная.',
  });
  assert.equal(body.model, 'openrouter/test-model');
  assert.deepEqual(body.usage, {
    inputTokens: 55,
    outputTokens: 18,
    totalTokens: 73,
  });

  const responseFormat = capturedRequestBody?.response_format as
    | { type?: string }
    | undefined;

  assert.equal(responseFormat?.type, 'json_schema');
  assert.equal(
    capturedRequestBody?.max_tokens,
    INPUT_LIMITS.ai.completionMaxTokens.chat,
  );
});

test('POST /api/ai/chat returns VALIDATION_ERROR for invalid history role', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/chat',
    payload: {
      ...validAiChatPayload,
      messages: [
        {
          role: 'system',
          content: 'Нельзя принимать system из frontend.',
        },
      ],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).code,
    'VALIDATION_ERROR',
  );
});

test('POST /api/ai/price returns VALIDATION_ERROR for malformed JSON', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/price',
    headers: {
      'content-type': 'application/json',
    },
    payload: invalidJsonPayload,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).code,
    'VALIDATION_ERROR',
  );
});

test('POST /api/ai/chat returns VALIDATION_ERROR for malformed JSON', async t => {
  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/chat',
    headers: {
      'content-type': 'application/json',
    },
    payload: invalidJsonPayload,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(
    ApiErrorResponseSchema.parse(response.json()).code,
    'VALIDATION_ERROR',
  );
});

test('POST /api/ai/chat streams backend-owned SSE events without provider-specific fields', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  let capturedRequestBody: Record<string, unknown> | undefined;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (requestUrl.includes('/chat/completions')) {
      capturedRequestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

      return createMockSseResponse([
        ': keep-alive\n\n',
        'data: {"id":"gen-chat-stream","model":"openrouter/test-model","choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"id":"gen-chat-stream","model":"openrouter/test-model","choices":[{"delta":{"content":"Состояние выглядит "}}]}\n\n',
        'data: {"id":"gen-chat-stream","model":"openrouter/test-model","choices":[{"delta":{"content":"аккуратным и ухоженным."}}]}\n\n',
        'data: {"id":"gen-chat-stream","model":"openrouter/test-model","usage":{"prompt_tokens":55,"completion_tokens":18,"total_tokens":73},"choices":[]}\n\n',
        'data: [DONE]\n\n',
      ]);
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const response = await fetch(`${address}/api/ai/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validAiChatPayload),
  });

  const rawBody = await readResponseStream(response);
  const events = parseSseEvents(rawBody).map(event =>
    AiChatStreamEventSchema.parse(event),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/i);
  assert.deepEqual(
    events.map(event => event.event),
    ['meta', 'chunk', 'chunk', 'done'],
  );
  assert.deepEqual(events[0].data, {
    model: 'openrouter/test-model',
  });
  assert.equal(
    events
      .filter(event => event.event === 'chunk')
      .map(event => event.data.content)
      .join(''),
    'Состояние выглядит аккуратным и ухоженным.',
  );
  assert.deepEqual(events.at(-1)?.data, {
    model: 'openrouter/test-model',
    usage: {
      inputTokens: 55,
      outputTokens: 18,
      totalTokens: 73,
    },
  });

  for (const event of events) {
    assert.equal('choices' in event.data, false);
    assert.equal('delta' in event.data, false);
    assert.equal('finish_reason' in event.data, false);
    assert.equal('id' in event.data, false);
  }

  assert.equal(capturedRequestBody?.stream, true);
  assert.equal(
    capturedRequestBody?.max_tokens,
    INPUT_LIMITS.ai.completionMaxTokens.chat,
  );
});

test('POST /api/ai/chat emits SSE error event when provider stream becomes invalid', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (requestUrl.includes('/chat/completions')) {
      return createMockSseResponse([
        'data: {"id":"gen-chat-stream","model":"openrouter/test-model","choices":[{"delta":{"content":"Часть ответа"}}]}\n\n',
        'data: {invalid-json}\n\n',
      ]);
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const response = await fetch(`${address}/api/ai/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validAiChatPayload),
  });

  const rawBody = await readResponseStream(response);
  const events = parseSseEvents(rawBody).map(event =>
    AiChatStreamEventSchema.parse(event),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(
    events.map(event => event.event),
    ['meta', 'chunk', 'error'],
  );
  assert.deepEqual(events.at(-1)?.data, {
    success: false,
    code: 'AI_PROVIDER_ERROR',
    message: 'Failed to receive a valid response from AI provider.',
  });
});

test('POST /api/ai/chat aborts the upstream stream after client disconnect', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  let upstreamAborted = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (requestUrl.includes('/chat/completions')) {
      const signal = init?.signal;

      assert.ok(signal);

      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"id":"gen-chat-stream","model":"openrouter/test-model","choices":[{"delta":{"content":"Часть ответа"}}]}\n\n',
              ),
            );

            signal.addEventListener(
              'abort',
              () => {
                upstreamAborted = true;
                controller.error(signal.reason);
              },
              { once: true },
            );
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
          },
        },
      );
    }

    return originalFetch(input, init);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const abortController = new AbortController();
  const response = await fetch(`${address}/api/ai/chat`, {
    method: 'POST',
    signal: abortController.signal,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validAiChatPayload),
  });

  const reader = response.body?.getReader();

  assert.ok(reader);
  await reader.read();

  abortController.abort();
  await waitForCondition(() => upstreamAborted);
});

test('POST /api/ai/description returns formatted 504 when the provider times out', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    timeoutMs: 25,
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  let timedOutUpstream = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;

      assert.ok(signal);

      if (signal.aborted) {
        timedOutUpstream = signal.reason?.name === 'TimeoutError';
        reject(signal.reason);
        return;
      }

      signal.addEventListener(
        'abort',
        () => {
          timedOutUpstream = signal.reason?.name === 'TimeoutError';
          reject(signal.reason);
        },
        { once: true },
      );
    })) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: validAiPayload,
  });

  assert.equal(timedOutUpstream, true);
  assert.equal(response.statusCode, 504);
  assert.deepEqual(ApiErrorResponseSchema.parse(response.json()), {
    success: false,
    code: 'AI_PROVIDER_ERROR',
    message: 'Failed to receive a valid response from AI provider.',
  });
});

test('GET /items keeps working after an AI endpoint failure', async t => {
  const originalAiConfig = structuredClone(config.ai);
  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
    },
  };

  t.after(() => {
    config.ai = originalAiConfig;
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    createMockResponse({
      id: 'gen-bad-description',
      model: 'openrouter/test-model',
      choices: [
        {
          message: {
            content: '',
          },
        },
      ],
    })) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const app = await buildApp();

  t.after(async () => {
    await app.close();
  });

  const aiResponse = await app.inject({
    method: 'POST',
    url: '/api/ai/description',
    payload: validAiPayload,
  });

  assert.equal(aiResponse.statusCode, 502);
  assert.equal(
    ApiErrorResponseSchema.parse(aiResponse.json()).code,
    'AI_PROVIDER_ERROR',
  );

  const itemsResponse = await app.inject({
    method: 'GET',
    url: '/items',
  });

  assert.equal(itemsResponse.statusCode, 200);

  const body = ItemsResponseSchema.parse(itemsResponse.json());

  assert.ok(Array.isArray(body.items));
  assert.equal(typeof body.total, 'number');
});
