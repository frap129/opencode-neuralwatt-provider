export const BASE_URL = 'https://api.neuralwatt.com/v1';

export interface ModelCapabilities {
  limit: { context: number; output: number };
  modalities?: { input: Array<'text' | 'image'>; output: Array<'text'> };
}

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  limit: { context: 131072, output: 32768 },
};

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'Qwen/Qwen3.5-397B-A17B-FP8': {
    limit: { context: 262144, output: 32768 },
  },
  'moonshotai/Kimi-K2.5': {
    limit: { context: 262144, output: 32768 },
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'zai-org/GLM-5.1-FP8': {
    limit: { context: 202752, output: 65536 },
  },
  'zai-org/GLM-5-FP8': {
    limit: { context: 202752, output: 65536 },
  },
  'MiniMaxAI/MiniMax-M2.5': {
    limit: { context: 196608, output: 65536 },
  },
  'mistralai/Devstral-Small-2-24B-Instruct-2512': {
    limit: { context: 262144, output: 65536 },
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'Qwen/Qwen3.5-35B-A3B': {
    limit: { context: 131072, output: 32768 },
  },
  'openai/gpt-oss-20b': {
    limit: { context: 16384, output: 8192 },
  },
};
