export const BASE_URL = 'https://api.neuralwatt.com/v1';

export interface ModelCapabilities {
  readonly limit: { readonly output: number };
  readonly modalities?: {
    readonly input: ReadonlyArray<'text' | 'image'>;
    readonly output: ReadonlyArray<'text'>;
  };
  readonly options?: Record<string, unknown>;
}

const _MODEL_CAPABILITIES = {
  'Qwen/Qwen3.5-397B-A17B-FP8': {
    limit: { output: 32768 },
  },
  'moonshotai/Kimi-K2.5': {
    limit: { output: 32768 },
    modalities: { input: ['text', 'image'] as const, output: ['text'] as const },
  },
  'zai-org/GLM-5.1-FP8': {
    limit: { output: 65536 },
  },
  'zai-org/GLM-5-FP8': {
    limit: { output: 65536 },
  },
  'MiniMaxAI/MiniMax-M2.5': {
    limit: { output: 65536 },
  },
  'mistralai/Devstral-Small-2-24B-Instruct-2512': {
    limit: { output: 65536 },
    modalities: { input: ['text', 'image'] as const, output: ['text'] as const },
  },
  'Qwen/Qwen3.6-35B-A3B': {
    limit: { output: 32768 },
    modalities: { input: ['text', 'image'] as const, output: ['text'] as const },
    options: { chat_template_kwargs: { preserve_thinking: true } },
  },
  'openai/gpt-oss-20b': {
    limit: { output: 8192 },
  },
} as const satisfies Record<string, ModelCapabilities>;

export type ModelId = keyof typeof _MODEL_CAPABILITIES;

// Use Record<string, ...> for runtime lookups by arbitrary model ID
export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = _MODEL_CAPABILITIES;
