import assert from 'node:assert/strict';
import test from 'node:test';

import { AppError } from 'src/shared/errors/app-error.ts';

import { createOpenRouterClient } from 'src/modules/ai/providers/openrouter/openrouter.client.ts';

const createAiConfig = (overrides?: Partial<Parameters<typeof createOpenRouterClient>[0]>) => ({
  enabled: true,
  provider: 'openrouter' as const,
  timeoutMs: 100,
  openrouter: {
    apiKey: 'super-secret-openrouter-key',
    model: 'openai/gpt-5-mini',
    baseUrl: 'https://openrouter.example/api/v1',
  },
  ...overrides,
});

test('createTextCompletion forwards provider preferences, plugins, headers, and response id', async t => {
  const originalFetch = globalThis.fetch;
  let capturedRequest: { input: unknown; init?: RequestInit } | undefined;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (input, init) => {
    capturedRequest = { input, init };

    return new Response(
      JSON.stringify({
        id: 'gen-123',
        model: 'anthropic/claude-sonnet-4.5',
        usage: {
          prompt_tokens: 11,
          completion_tokens: 7,
          total_tokens: 18,
          cost: 0.42,
        },
        choices: [
          {
            finish_reason: 'stop',
            native_finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: '  structured answer  ',
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  };

  const client = createOpenRouterClient(createAiConfig());
  const result = await client.createTextCompletion({
    endpoint: 'chat',
    messages: [{ role: 'user', content: 'Parse this PDF.' }],
    models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5-mini'],
    route: 'fallback',
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'answer',
        strict: true,
        schema: {
          type: 'object',
        },
      },
    },
    provider: {
      sort: {
        by: 'latency',
        partition: 'none',
      },
      allow_fallbacks: false,
      preferred_max_latency: {
        p90: 2,
      },
    },
    plugins: [{ id: 'file-parser' }, { id: 'response-healing' }],
    headers: {
      'x-anthropic-beta': 'structured-outputs-2025-11-13',
    },
  });

  assert.deepEqual(result, {
    id: 'gen-123',
    model: 'anthropic/claude-sonnet-4.5',
    text: 'structured answer',
    usage: {
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      cost: 0.42,
    },
  });

  assert.ok(capturedRequest);
  assert.equal(
    capturedRequest.input,
    'https://openrouter.example/api/v1/chat/completions',
  );
  assert.equal(capturedRequest.init?.headers instanceof Headers, false);

  const headers = capturedRequest.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer super-secret-openrouter-key');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(
    headers['x-anthropic-beta'],
    'structured-outputs-2025-11-13',
  );

  const body = JSON.parse(String(capturedRequest.init?.body));
  assert.deepEqual(body, {
    models: ['anthropic/claude-sonnet-4.5', 'openai/gpt-5-mini'],
    route: 'fallback',
    provider: {
      sort: {
        by: 'latency',
        partition: 'none',
      },
      allow_fallbacks: false,
      preferred_max_latency: {
        p90: 2,
      },
    },
    plugins: [{ id: 'file-parser' }, { id: 'response-healing' }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'answer',
        strict: true,
        schema: {
          type: 'object',
        },
      },
    },
    messages: [{ role: 'user', content: 'Parse this PDF.' }],
    stream: false,
  });
});

test('createTextCompletion rejects tool call responses for text-only callers', async t => {
  const originalFetch = globalThis.fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'gen-tool',
        model: 'openai/gpt-5-mini',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'lookup',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

  const client = createOpenRouterClient(createAiConfig());

  await assert.rejects(
    client.createTextCompletion({
      endpoint: 'chat',
      messages: [{ role: 'user', content: 'Use tools if needed.' }],
    }),
    error =>
      error instanceof AppError &&
      error.code === 'AI_PROVIDER_ERROR' &&
      error.statusCode === 502,
  );
});

test('createTextCompletion preserves late caller aborts without AbortSignal.any', async t => {
  const originalFetch = globalThis.fetch;
  const originalAbortSignalAny = AbortSignal.any;

  t.after(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(AbortSignal, 'any', {
      configurable: true,
      writable: true,
      value: originalAbortSignalAny,
    });
  });

  Object.defineProperty(AbortSignal, 'any', {
    configurable: true,
    writable: true,
    value: undefined,
  });

  let abortedBySignal = false;

  globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;

      assert.ok(signal);

      if (signal.aborted) {
        abortedBySignal = true;
        reject(signal.reason);
        return;
      }

      signal.addEventListener(
        'abort',
        () => {
          abortedBySignal = true;
          reject(signal.reason);
        },
        { once: true },
      );
    });

  const client = createOpenRouterClient(
    createAiConfig({
      timeoutMs: 1000,
    }),
  );

  const abortController = new AbortController();
  const completionPromise = client.createTextCompletion({
    endpoint: 'chat',
    messages: [{ role: 'user', content: 'Abort this request.' }],
    signal: abortController.signal,
  });

  setTimeout(() => {
    const abortReason = new Error('Caller aborted the request.');
    abortReason.name = 'AbortError';
    abortController.abort(abortReason);
  }, 10);

  await assert.rejects(
    completionPromise,
    error =>
      error instanceof AppError &&
      error.code === 'AI_PROVIDER_ERROR' &&
      error.statusCode === 502,
  );

  assert.equal(abortedBySignal, true);
});

test('provider failures log safe metadata without leaking the API key', async t => {
  const originalFetch = globalThis.fetch;
  const logs: Array<{ level: string; metadata: Record<string, unknown>; message?: string }> =
    [];

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () =>
    new Response('<html>upstream exploded</html>', {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
      },
    });

  const client = createOpenRouterClient(createAiConfig(), {
    info: (metadata, message) => {
      logs.push({ level: 'info', metadata, message });
    },
    warn: (metadata, message) => {
      logs.push({ level: 'warn', metadata, message });
    },
    error: (metadata, message) => {
      logs.push({ level: 'error', metadata, message });
    },
  });

  await assert.rejects(
    client.createTextCompletion({
      endpoint: 'description',
      messages: [{ role: 'user', content: 'Suggest a title.' }],
    }),
    error =>
      error instanceof AppError &&
      error.code === 'AI_PROVIDER_ERROR' &&
      error.statusCode === 502,
  );

  assert.equal(logs.length, 1);
  assert.equal(logs[0].level, 'warn');
  assert.equal(logs[0].message, 'OpenRouter request returned an upstream error.');
  assert.equal(
    JSON.stringify(logs).includes('super-secret-openrouter-key'),
    false,
  );
});
