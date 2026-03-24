const env = {
  PORT: process.env.PORT,
  AI_ENABLED: process.env.AI_ENABLED,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return fallback;
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseCsvList = (value: string | undefined, fallback: string[]): string[] => {
  if (!value) return fallback;

  const values = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);

  return values.length ? values : fallback;
};

export const DEFAULT_DEV_CORS_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173',
];

export type AppConfig = {
  port: number;
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
  cors: {
    allowedOrigins: parseCsvList(
      env.CORS_ALLOWED_ORIGINS,
      DEFAULT_DEV_CORS_ALLOWED_ORIGINS,
    ),
  },
  ai: {
    enabled: aiEnabled,
    provider: aiEnabled ? 'openrouter' : null,
    timeoutMs: parsePositiveInt(env.AI_TIMEOUT_MS, 45000),
    openrouter: {
      apiKey: openrouterApiKey,
      model: env.OPENROUTER_MODEL?.trim() || 'qwen/qwen3-next-80b-a3b-instruct',
      baseUrl: env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1',
    },
  },
};
