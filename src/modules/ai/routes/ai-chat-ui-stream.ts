import type { UIMessage } from 'ai';
import { safeValidateUIMessages } from 'ai';
import { z } from 'zod';

import {
  AiChatRequestSchema,
  AiLegacyChatRequestSchema,
  type AiChatHistoryMessage,
} from 'src/modules/ai/contracts/ai-request.contract.ts';
import { INPUT_LIMITS } from 'src/shared/constants/input-limits.ts';
import { validationError } from 'src/shared/errors/app-error.ts';

const HistoryMessageContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(INPUT_LIMITS.ai.historyMessageMaxLength);

const UserMessageContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(INPUT_LIMITS.ai.userMessageMaxLength);

const isTextPart = (
  part: unknown,
): part is {
  type: 'text';
  text: string;
} =>
  typeof part === 'object' &&
  part !== null &&
  'type' in part &&
  part.type === 'text' &&
  'text' in part &&
  typeof part.text === 'string';

export const getTextContent = (message: UIMessage): string =>
  message.parts
    .filter(isTextPart)
    .map(part => part.text)
    .join('')
    .trim();

export const toChatHistory = (messages: UIMessage[]): AiChatHistoryMessage[] =>
  messages.flatMap(message => {
    if (message.role !== 'user' && message.role !== 'assistant') {
      return [];
    }

    const textContent = getTextContent(message);

    if (!textContent) {
      return [];
    }

    return [
      {
        role: message.role,
        content: HistoryMessageContentSchema.parse(textContent),
      },
    ];
  });

export const splitLastUserTurn = (
  messages: UIMessage[],
): {
  history: AiChatHistoryMessage[];
  userMessage: string;
} => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.role !== 'user') {
      continue;
    }

    const textContent = getTextContent(message);

    if (!textContent) {
      continue;
    }

    return {
      history: toChatHistory(messages.slice(0, index)),
      userMessage: UserMessageContentSchema.parse(textContent),
    };
  }

  throw validationError('Request validation failed.');
};

export const normalizeAiChatRequest = async (
  body: unknown,
): Promise<
  | {
      item: z.infer<typeof AiChatRequestSchema>['item'];
      originalMessages: UIMessage[];
      history: AiChatHistoryMessage[];
      userMessage: string;
    }
  | {
      item: z.infer<typeof AiLegacyChatRequestSchema>['item'];
      originalMessages: UIMessage[];
      history: AiChatHistoryMessage[];
      userMessage: string;
    }
> => {
  const parsedAiSdkRequest = AiChatRequestSchema.safeParse(body ?? {});

  if (parsedAiSdkRequest.success) {
    const validatedMessagesResult = await safeValidateUIMessages({
      messages: parsedAiSdkRequest.data.messages,
    });

    if (!validatedMessagesResult.success) {
      throw validationError('Request validation failed.');
    }

    return {
      item: parsedAiSdkRequest.data.item,
      originalMessages: validatedMessagesResult.data,
      ...splitLastUserTurn(validatedMessagesResult.data),
    };
  }

  const parsedLegacyRequest = AiLegacyChatRequestSchema.parse(body ?? {});

  return {
    item: parsedLegacyRequest.item,
    originalMessages: parsedLegacyRequest.messages.map((message, index) => ({
      id: `legacy-message-${index}`,
      role: message.role,
      parts: [
        {
          type: 'text',
          text: message.content,
        },
      ],
    })),
    history: parsedLegacyRequest.messages,
    userMessage: parsedLegacyRequest.userMessage,
  };
};
