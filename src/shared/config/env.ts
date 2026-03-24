export const env = {
  PORT: process.env.PORT,
  AI_ENABLED: process.env.AI_ENABLED,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
  AI_TIMEOUT_MS: process.env.AI_TIMEOUT_MS,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
};

export const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

  return fallback;
};

export const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const parseCsvList = (
  value: string | undefined,
  fallback: string[],
): string[] => {
  if (!value) return fallback;

  const values = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);

  return values.length ? values : fallback;
};
