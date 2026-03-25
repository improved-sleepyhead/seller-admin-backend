const stripCodeFence = (value: string): string => {
  const trimmed = value.trim();
  const codeFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return codeFenceMatch?.[1]?.trim() ?? trimmed;
};

export const tryParseJson = (value: string): unknown => {
  try {
    return JSON.parse(stripCodeFence(value));
  } catch {
    return undefined;
  }
};
