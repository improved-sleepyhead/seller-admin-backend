import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';

import items from 'data/items.json' with { type: 'json' };
import {
  config,
} from 'src/shared/config/app-config.ts';
import {
  AiDescriptionResponseSchema,
  AiPriceResponseSchema,
  AiStatusResponseSchema,
} from 'src/modules/ai/contracts/ai-response.contract.ts';
import { ItemReadDtoSchema } from 'src/modules/items/contracts/item-read.contract.ts';
import {
  ItemsResponseSchema,
  ItemUpdateSuccessResponseSchema,
} from 'src/modules/items/contracts/item-response.contract.ts';
import { ApiErrorResponseSchema } from 'src/shared/contracts/api-error.contract.ts';
import { buildApp } from 'src/app/build-app.ts';

type MockOpenRouterRequest = {
  authorizationHeader?: string;
  body: Record<string, unknown>;
};

const APP_HOST = '127.0.0.1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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

const parseSseDataFrames = (rawBody: string): unknown[] =>
  rawBody
    .split('\n\n')
    .map(frame => frame.trim())
    .filter(Boolean)
    .map(frame => {
      let data = '';

      for (const line of frame.split('\n')) {
        if (line.startsWith('data:')) {
          data += `${data ? '\n' : ''}${line.slice('data:'.length).trimStart()}`;
        }
      }

      if (!data) {
        return undefined;
      }

      return data === '[DONE]' ? data : (JSON.parse(data) as unknown);
    })
    .filter(frame => frame !== undefined);

const getUiMessageChunks = (
  frames: unknown[],
): Array<Record<string, unknown> & { type: string }> =>
  frames.filter(
    (
      frame,
    ): frame is Record<string, unknown> & {
      type: string;
    } => isRecord(frame) && typeof frame.type === 'string',
  );

const readJsonRequestBody = async (
  request: IncomingMessage,
): Promise<Record<string, unknown>> => {
  let rawBody = '';

  for await (const chunk of request) {
    rawBody += chunk.toString();
  }

  const parsedBody = JSON.parse(rawBody || '{}') as unknown;

  assert.equal(isRecord(parsedBody), true);

  return parsedBody;
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void => {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
};

const startMockOpenRouterServer = async (): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
  requests: MockOpenRouterRequest[];
}> => {
  const requests: MockOpenRouterRequest[] = [];
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/chat/completions') {
      response.statusCode = 404;
      response.end();
      return;
    }

    const body = await readJsonRequestBody(request);
    requests.push({
      authorizationHeader: request.headers.authorization,
      body,
    });

    const responseFormat = isRecord(body.response_format)
      ? body.response_format
      : undefined;
    const jsonSchema = responseFormat && isRecord(responseFormat.json_schema)
      ? responseFormat.json_schema
      : undefined;
    const responseSchemaName =
      typeof jsonSchema?.name === 'string' ? jsonSchema.name : undefined;

    if (responseSchemaName === 'ai_description_response') {
      sendJson(response, 200, {
        id: 'smoke-description',
        model: 'openrouter/test-model',
        usage: {
          prompt_tokens: 14,
          completion_tokens: 7,
          total_tokens: 21,
        },
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestion:
                  'Короткое smoke-описание: ухоженное объявление с понятным состоянием и готовностью к показу.',
              }),
            },
          },
        ],
      });
      return;
    }

    if (responseSchemaName === 'ai_price_response') {
      sendJson(response, 200, {
        id: 'smoke-price',
        model: 'openrouter/test-model',
        usage: {
          prompt_tokens: 18,
          completion_tokens: 9,
          total_tokens: 27,
        },
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestedPrice: 512345,
                reasoning:
                  'Smoke-проверка: цена выглядит реалистичной для категории, описания и состояния товара.',
              }),
            },
          },
        ],
      });
      return;
    }

    if (body.stream === true) {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/event-stream');
      response.write(
        'data: {"id":"smoke-chat","model":"openrouter/test-model","choices":[{"delta":{"content":"Smoke-ответ: состояние аккуратное, "}}]}\n\n',
      );
      response.write(
        'data: {"id":"smoke-chat","model":"openrouter/test-model","choices":[{"delta":{"content":"историю можно описать как прозрачную и понятную."}}],"usage":{"prompt_tokens":22,"completion_tokens":11,"total_tokens":33}}\n\n',
      );
      response.end('data: [DONE]\n\n');
      return;
    }

    sendJson(response, 400, {
      error: {
        message: 'Unsupported smoke response format.',
      },
    });
  });

  server.listen(0, APP_HOST);
  await once(server, 'listening');

  const address = server.address();

  assert.ok(address);
  assert.equal(typeof address, 'object');

  return {
    baseUrl: `http://${APP_HOST}:${address.port}`,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
};

const startAppServer = async (): Promise<{
  address: string;
  close: () => Promise<void>;
}> => {
  const app = await buildApp();
  const address = await app.listen({ port: 0, host: APP_HOST });

  return {
    address,
    close: () => app.close(),
  };
};

const setEnabledAiConfig = (
  baseUrl: string,
): {
  restore: () => void;
} => {
  const originalAiConfig = structuredClone(config.ai);

  config.ai = {
    ...originalAiConfig,
    enabled: true,
    provider: 'openrouter',
    openrouter: {
      ...originalAiConfig.openrouter,
      apiKey: 'test-openrouter-key',
      baseUrl,
      model: 'openrouter/test-model',
    },
  };

  return {
    restore: () => {
      config.ai = originalAiConfig;
    },
  };
};

const setDisabledAiConfig = (): {
  restore: () => void;
} => {
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

  return {
    restore: () => {
      config.ai = originalAiConfig;
    },
  };
};

const fetchJson = async (
  input: string,
  init?: RequestInit,
): Promise<{
  response: Response;
  body: unknown;
}> => {
  const response = await fetch(input, init);
  const body = (await response.json()) as unknown;

  return {
    response,
    body,
  };
};

test(
  'smoke/e2e covers item list, detail and full update via live HTTP PATCH',
  { concurrency: false },
  async t => {
    const { address, close } = await startAppServer();

    t.after(async () => {
      await close();
    });

    const listResult = await fetchJson(
      `${address}/items?limit=2&skip=0&sortColumn=price&sortDirection=asc`,
    );

    assert.equal(listResult.response.status, 200);

    const listBody = ItemsResponseSchema.parse(listResult.body);

    assert.equal(listBody.items.length > 0, true);
    assert.equal(listBody.total >= listBody.items.length, true);

    const sourceItem = items[0];
    const detailBeforeResult = await fetchJson(`${address}/items/${sourceItem.id}`);

    assert.equal(detailBeforeResult.response.status, 200);

    const detailBefore = ItemReadDtoSchema.parse(detailBeforeResult.body);
    const originalUpdatedAt = detailBefore.updatedAt;

    await new Promise(resolve => setTimeout(resolve, 5));

    const updatePayload = {
      category: sourceItem.category,
      title: `${detailBefore.title} smoke`,
      description: detailBefore.description
        ? `${detailBefore.description} Smoke update.`
        : 'Smoke update.',
      price: detailBefore.price + 1234,
      params: structuredClone(sourceItem.params),
    };

    const updateResult = await fetchJson(`${address}/items/${detailBefore.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    assert.equal(updateResult.response.status, 200);
    assert.deepEqual(ItemUpdateSuccessResponseSchema.parse(updateResult.body), {
      success: true,
    });

    const detailAfterResult = await fetchJson(`${address}/items/${detailBefore.id}`);

    assert.equal(detailAfterResult.response.status, 200);

    const detailAfter = ItemReadDtoSchema.parse(detailAfterResult.body);

    assert.equal(detailAfter.id, detailBefore.id);
    assert.equal(detailAfter.createdAt, detailBefore.createdAt);
    assert.notEqual(detailAfter.updatedAt, originalUpdatedAt, 'updatedAt should change after full PATCH');
    assert.equal(detailAfter.title, updatePayload.title);
    assert.equal(detailAfter.description, updatePayload.description);
    assert.equal(detailAfter.price, updatePayload.price);
    assert.deepEqual(detailAfter.params, updatePayload.params);
  },
);

test(
  'smoke/e2e covers AI status, description, price and chat via live HTTP',
  { concurrency: false },
  async t => {
    const mockOpenRouter = await startMockOpenRouterServer();
    const aiConfigHandle = setEnabledAiConfig(mockOpenRouter.baseUrl);

    t.after(async () => {
      aiConfigHandle.restore();
      await mockOpenRouter.close();
    });

    const { address, close } = await startAppServer();

    t.after(async () => {
      await close();
    });

    const statusResult = await fetchJson(`${address}/api/ai/status`);

    assert.equal(statusResult.response.status, 200);
    assert.deepEqual(AiStatusResponseSchema.parse(statusResult.body), {
      enabled: true,
      provider: 'openrouter',
      model: 'openrouter/test-model',
      features: {
        description: true,
        price: true,
        chat: true,
      },
    });

    const aiItem = items[0];

    const descriptionResult = await fetchJson(`${address}/api/ai/description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: aiItem,
      }),
    });

    assert.equal(descriptionResult.response.status, 200);
    assert.match(
      AiDescriptionResponseSchema.parse(descriptionResult.body).suggestion,
      /smoke-описание/i,
    );

    const priceResult = await fetchJson(`${address}/api/ai/price`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: aiItem,
      }),
    });

    assert.equal(priceResult.response.status, 200);

    const priceBody = AiPriceResponseSchema.parse(priceResult.body);

    assert.equal(priceBody.suggestedPrice, 512345);
    assert.equal(priceBody.currency, 'RUB');

    const chatResponse = await fetch(`${address}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: aiItem,
        messages: [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text: 'Здравствуйте. Что для вас важно уточнить?',
              },
            ],
          },
          {
            id: 'user-1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Подскажи, как коротко описать состояние товара.',
              },
            ],
          },
        ],
      }),
    });

    const chatFrames = parseSseDataFrames(await readResponseStream(chatResponse));
    const chatChunks = getUiMessageChunks(chatFrames);

    assert.equal(chatResponse.status, 200);
    assert.equal(chatResponse.headers.get('x-vercel-ai-ui-message-stream'), 'v1');
    assert.equal(chatFrames.at(-1), '[DONE]');
    assert.match(
      chatChunks
        .filter(chunk => chunk.type === 'text-delta')
        .map(chunk => String(chunk.delta ?? ''))
        .join(''),
      /Smoke-ответ/,
    );

    assert.deepEqual(
      mockOpenRouter.requests.map(request => request.authorizationHeader),
      [
        'Bearer test-openrouter-key',
        'Bearer test-openrouter-key',
        'Bearer test-openrouter-key',
      ],
    );
    assert.deepEqual(
      mockOpenRouter.requests.map(request =>
        isRecord(request.body.response_format) &&
        isRecord(request.body.response_format.json_schema) &&
        typeof request.body.response_format.json_schema.name === 'string'
          ? request.body.response_format.json_schema.name
          : null,
      ),
      ['ai_description_response', 'ai_price_response', null],
    );
    assert.deepEqual(
      mockOpenRouter.requests.map(request => request.body.stream),
      [false, false, true],
    );
  },
);

test(
  'smoke/e2e covers representative error paths via live HTTP',
  { concurrency: false },
  async t => {
    const aiConfigHandle = setDisabledAiConfig();

    t.after(() => {
      aiConfigHandle.restore();
    });

    const { address, close } = await startAppServer();

    t.after(async () => {
      await close();
    });

    const invalidIdResult = await fetchJson(`${address}/items/abc`);

    assert.equal(invalidIdResult.response.status, 400);
    assert.equal(
      ApiErrorResponseSchema.parse(invalidIdResult.body).code,
      'VALIDATION_ERROR',
    );

    const missingItemResult = await fetchJson(`${address}/items/999999`);

    assert.equal(missingItemResult.response.status, 404);
    assert.equal(
      ApiErrorResponseSchema.parse(missingItemResult.body).code,
      'NOT_FOUND',
    );

    const invalidAiPayloadResult = await fetchJson(`${address}/api/ai/description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    assert.equal(invalidAiPayloadResult.response.status, 400);
    assert.equal(
      ApiErrorResponseSchema.parse(invalidAiPayloadResult.body).code,
      'VALIDATION_ERROR',
    );

    const malformedAiJsonResult = await fetchJson(`${address}/api/ai/description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: '{"item":',
    });

    assert.equal(malformedAiJsonResult.response.status, 400);
    assert.equal(
      ApiErrorResponseSchema.parse(malformedAiJsonResult.body).code,
      'VALIDATION_ERROR',
    );

    const aiUnavailableResult = await fetchJson(`${address}/api/ai/description`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        item: items[0],
      }),
    });

    assert.equal(aiUnavailableResult.response.status, 503);
    assert.equal(
      ApiErrorResponseSchema.parse(aiUnavailableResult.body).code,
      'AI_UNAVAILABLE',
    );

    const disabledStatusResult = await fetchJson(`${address}/api/ai/status`);

    assert.equal(disabledStatusResult.response.status, 200);
    assert.deepEqual(AiStatusResponseSchema.parse(disabledStatusResult.body), {
      enabled: false,
      provider: null,
      model: null,
      features: {
        description: false,
        price: false,
        chat: false,
      },
    });
  },
);
