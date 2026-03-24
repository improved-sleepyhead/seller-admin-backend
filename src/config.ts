const DEFAULT_PORT = 8080;
const DEFAULT_AI_ENABLED = true;
const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_AI_TIMEOUT_MS = 15000;
const DEFAULT_CORS_ALLOWED_ORIGINS = ['*'];

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

const openrouterApiKey = process.env.OPENROUTER_API_KEY?.trim() || null;
const aiFeatureEnabled = parseBoolean(process.env.AI_ENABLED, DEFAULT_AI_ENABLED);

const aiEnabled = aiFeatureEnabled && Boolean(openrouterApiKey);

export const config: AppConfig = {
  port: parsePositiveInt(process.env.PORT, DEFAULT_PORT),
  cors: {
    allowedOrigins: parseCsvList(
      process.env.CORS_ALLOWED_ORIGINS,
      DEFAULT_CORS_ALLOWED_ORIGINS,
    ),
  },
  ai: {
    enabled: aiEnabled,
    provider: aiEnabled ? 'openrouter' : null,
    timeoutMs: parsePositiveInt(process.env.AI_TIMEOUT_MS, DEFAULT_AI_TIMEOUT_MS),
    openrouter: {
      apiKey: openrouterApiKey,
      model: process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
      baseUrl:
        process.env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE_URL,
    },
  },
};
