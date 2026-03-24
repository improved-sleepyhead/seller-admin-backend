import assert from 'node:assert/strict';
import test from 'node:test';

import items from 'data/items.json' with { type: 'json' };
import {
  buildChatPromptMessages,
  buildDescriptionPromptMessages,
  buildPricePromptMessages,
} from 'src/ai/ai-prompts.ts';

const item = items[0];

const assertSharedPromptContract = (messages: Array<{ role: string; content: unknown }>) => {
  assert.equal(messages[0]?.role, 'system');
  assert.equal(typeof messages[0]?.content, 'string');
  assert.match(messages[0].content as string, /только на русском языке/i);
};

test('prompt builders include shared system prompt and item context', () => {
  const descriptionPrompt = buildDescriptionPromptMessages(item);
  const pricePrompt = buildPricePromptMessages(item);
  const chatPrompt = buildChatPromptMessages({
    item,
    messages: [],
    userMessage: 'Как лучше ответить покупателю?',
  });

  for (const prompt of [descriptionPrompt, pricePrompt, chatPrompt]) {
    assertSharedPromptContract(prompt);

    assert.equal(prompt[1]?.role, 'user');
    assert.equal(typeof prompt[1]?.content, 'string');
    assert.match(prompt[1].content as string, /"category": "auto"/);
    assert.match(prompt[1].content as string, /Почти новая Mitsubishi Lancer/);
    assert.match(prompt[1].content as string, /"price": 300000/);
  }
});

test('prompt builders keep endpoint-specific tasks for description, price and chat', () => {
  const descriptionPrompt = buildDescriptionPromptMessages(item);
  const pricePrompt = buildPricePromptMessages(item);
  const chatPrompt = buildChatPromptMessages({
    item,
    messages: [{ role: 'assistant', content: 'Уточните состояние кузова.' }],
    userMessage: 'Что ещё стоит добавить в объявление?',
  });

  assert.match(descriptionPrompt[1].content as string, /Улучши описание объявления/);
  assert.match(descriptionPrompt[1].content as string, /только итоговый текст описания/i);

  assert.match(pricePrompt[1].content as string, /рекомендуемую цену объявления в рублях/i);
  assert.match(pricePrompt[1].content as string, /короткое объяснение/i);

  assert.match(chatPrompt[1].content as string, /Отвечай кратко и по делу/i);
  assert.match(chatPrompt[1].content as string, /историю диалога/i);
  assert.deepEqual(chatPrompt[2], {
    role: 'assistant',
    content: 'Уточните состояние кузова.',
  });
  assert.deepEqual(chatPrompt[3], {
    role: 'user',
    content: 'Что ещё стоит добавить в объявление?',
  });
});

test('prompt builders do not require frontend to supply system instructions', () => {
  const prompt = buildDescriptionPromptMessages(item);

  assert.equal(prompt.length, 2);
  assert.equal(prompt[0]?.role, 'system');
  assert.match(prompt[0].content as string, /не выдумывай факты/i);
  assert.match(prompt[1].content as string, /"description": null/);
});
