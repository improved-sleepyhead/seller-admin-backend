import {
  env,
  parseBoolean,
  parseCsvList,
  parsePositiveInt,
  parseString,
} from './env.ts';

export const DEFAULT_DEV_CORS_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];
export const DEFAULT_AI_TIMEOUT_MS = 45000;
export const MIN_AI_TIMEOUT_MS = 30000;

export const resolveAiTimeoutMs = (value: string | undefined): number => {
  const parsedTimeoutMs = parsePositiveInt(value, DEFAULT_AI_TIMEOUT_MS);
  return Math.max(parsedTimeoutMs, MIN_AI_TIMEOUT_MS);
};

export type AppConfig = {
  port: number;
  host: string;
  dev: {
    delayEnabled: boolean;
  };
  cors: {
    allowedOrigins: string[];
  };
  ai: {
    enabled: boolean;
    provider: 'openrouter' | null;
    timeoutMs: number;
    openrouter: {
      apiKey: string | null;
      model: string;
      baseUrl: string;
    };
  };
};

const openrouterApiKey = env.OPENROUTER_API_KEY?.trim() || null;
const aiFeatureEnabled = parseBoolean(env.AI_ENABLED, true);
const aiEnabled = aiFeatureEnabled && Boolean(openrouterApiKey);

export const config: AppConfig = {
  port: parsePositiveInt(env.PORT, 8080),
  host: parseString(env.HOST, '0.0.0.0'),
  dev: {
    delayEnabled: parseBoolean(env.DEV_DELAY_ENABLED, false),
  },
  cors: {
    allowedOrigins: parseCsvList(
      env.CORS_ALLOWED_ORIGINS,
      DEFAULT_DEV_CORS_ALLOWED_ORIGINS,
    ),
  },
  ai: {
    enabled: aiEnabled,
    provider: aiEnabled ? 'openrouter' : null,
    timeoutMs: resolveAiTimeoutMs(env.AI_TIMEOUT_MS),
    openrouter: {
      apiKey: openrouterApiKey,
      model: env.OPENROUTER_MODEL?.trim() || 'qwen/qwen3-next-80b-a3b-instruct',
      baseUrl: env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    },
  },
};
