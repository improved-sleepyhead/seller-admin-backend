import { aiProviderError } from 'src/shared/errors/app-error.ts';

import { isRecord, OPENROUTER_ERROR_MESSAGE } from './openrouter.response.ts';
import type { OpenRouterResponsePayload } from './openrouter.types.ts';

export const extractSseDataPayload = (chunk: string): string | undefined => {
  const dataLines = chunk
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => line.length > 0 && !line.startsWith(':'))
    .flatMap(line => (line.startsWith('data:') ? [line.slice(5).trimStart()] : []));

  return dataLines.length ? dataLines.join('\n') : undefined;
};

export const parseStreamingPayload = (
  data: string,
): OpenRouterResponsePayload => {
  try {
    const payload = JSON.parse(data) as unknown;

    if (!isRecord(payload)) {
      throw new Error('Provider response should be an object.');
    }

    return payload;
  } catch {
    throw aiProviderError(OPENROUTER_ERROR_MESSAGE);
  }
};
