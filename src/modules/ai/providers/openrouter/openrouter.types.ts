export type Logger = {
  info: (object: Record<string, unknown>, message?: string) => void;
  warn: (object: Record<string, unknown>, message?: string) => void;
  error: (object: Record<string, unknown>, message?: string) => void;
};

export type OpenRouterTextContentPart = {
  type: 'text';
  text: string;
};

export type OpenRouterImageContentPart = {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: string;
  };
};

export type OpenRouterContentPart =
  | OpenRouterTextContentPart
  | OpenRouterImageContentPart;

export type OpenRouterMessage =
  | {
      role: 'system' | 'user' | 'assistant';
      content: string | OpenRouterContentPart[];
      name?: string;
    }
  | {
      role: 'tool';
      content: string;
      tool_call_id: string;
      name?: string;
    };

export type OpenRouterResponseFormat =
  | { type: 'json_object' }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict?: boolean;
        schema: Record<string, unknown>;
      };
    };

export type OpenRouterFunctionParameters = Record<string, unknown>;

export type OpenRouterTool = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: OpenRouterFunctionParameters;
    strict?: boolean;
  };
};

export type OpenRouterToolChoice =
  | 'none'
  | 'auto'
  | {
      type: 'function';
      function: {
        name: string;
      };
    };

export type OpenRouterPlugin = {
  id: string;
  enabled?: boolean;
  [key: string]: unknown;
};

export type OpenRouterProviderSort =
  | 'price'
  | 'throughput'
  | 'latency'
  | {
      by: 'price' | 'throughput' | 'latency';
      partition?: 'model' | 'none';
    };

export type OpenRouterProviderMetricPreference =
  | number
  | {
      p50?: number;
      p75?: number;
      p90?: number;
      p99?: number;
    };

export type OpenRouterProviderPreferences = {
  order?: string[];
  allow_fallbacks?: boolean;
  require_parameters?: boolean;
  data_collection?: 'allow' | 'deny';
  zdr?: boolean;
  enforce_distillable_text?: boolean;
  only?: string[];
  ignore?: string[];
  quantizations?: string[];
  sort?: OpenRouterProviderSort;
  preferred_min_throughput?: OpenRouterProviderMetricPreference;
  preferred_max_latency?: OpenRouterProviderMetricPreference;
  max_price?: Record<string, number>;
  [key: string]: unknown;
};

export type OpenRouterTextCompletionRequest = {
  endpoint: 'description' | 'price' | 'chat';
  messages: OpenRouterMessage[];
  signal?: AbortSignal;
  headers?: Record<string, string>;
  model?: string;
  models?: string[];
  route?: 'fallback';
  user?: string;
  provider?: OpenRouterProviderPreferences;
  plugins?: OpenRouterPlugin[];
  responseFormat?: OpenRouterResponseFormat;
  tools?: OpenRouterTool[];
  toolChoice?: OpenRouterToolChoice;
  maxTokens?: number;
  temperature?: number;
  stop?: string | string[];
};

export type OpenRouterUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cost?: number;
};

export type OpenRouterTextCompletionResult = {
  id: string;
  model: string;
  text: string;
  usage?: OpenRouterUsage;
};

export type OpenRouterTextStreamStart = {
  id: string;
  model: string;
};

export type OpenRouterTextStreamHandlers = {
  onResponseStart?: (
    metadata: OpenRouterTextStreamStart,
  ) => void | Promise<void>;
  onTextDelta: (delta: string) => void | Promise<void>;
};

export type OpenRouterTextCompletionStreamResult = {
  id: string;
  model: string;
  usage?: OpenRouterUsage;
};

export type OpenRouterClient = {
  readonly enabled: boolean;
  readonly provider: 'openrouter';
  readonly model: string;
  readonly baseUrl: string;
  assertAvailable: () => void;
  createTextCompletion: (
    request: OpenRouterTextCompletionRequest,
  ) => Promise<OpenRouterTextCompletionResult>;
  streamTextCompletion: (
    request: OpenRouterTextCompletionRequest,
    handlers: OpenRouterTextStreamHandlers,
  ) => Promise<OpenRouterTextCompletionStreamResult>;
};

export type OpenRouterResponseErrorPayload = {
  code?: unknown;
  message?: unknown;
};

export type OpenRouterResponseChoicePayload = {
  finish_reason?: unknown;
  message?: unknown;
  text?: unknown;
  error?: unknown;
};

export type OpenRouterResponsePayload = {
  id?: unknown;
  model?: unknown;
  usage?: unknown;
  choices?: unknown;
};

export type RequestSignalHandle = {
  signal: AbortSignal;
  cleanup: () => void;
};
