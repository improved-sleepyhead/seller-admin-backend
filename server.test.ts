import assert from 'node:assert/strict';
import test from 'node:test';

import items from 'data/items.json' with { type: 'json' };
import { config } from 'src/config.ts';
import { buildApp } from './server.ts';

const validAiPayload = {
  item: items[0],
};

const createMockResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
    },
    ...init,
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
  assert.equal(response.json().code, 'AI_UNAVAILABLE');
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

  const body = response.json();

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
  assert.equal(response.json().code, 'AI_PROVIDER_ERROR');
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
  assert.equal(response.json().code, 'VALIDATION_ERROR');
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
  assert.equal(aiResponse.json().code, 'AI_PROVIDER_ERROR');

  const itemsResponse = await app.inject({
    method: 'GET',
    url: '/items',
  });

  assert.equal(itemsResponse.statusCode, 200);

  const body = itemsResponse.json();

  assert.ok(Array.isArray(body.items));
  assert.equal(typeof body.total, 'number');
});
