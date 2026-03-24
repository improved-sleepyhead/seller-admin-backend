import assert from 'node:assert/strict';
import test from 'node:test';

import items from 'data/items.json' with { type: 'json' };
import { config } from 'src/config.ts';
import { buildApp } from './server.ts';

const validAiPayload = {
  item: items[0],
};

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

test('AI endpoints return AI_PROVIDER_ERROR when AI is enabled but no normalized response exists', async t => {
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
