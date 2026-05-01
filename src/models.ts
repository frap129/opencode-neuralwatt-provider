import { BASE_URL, MODEL_CAPABILITIES } from './constants.ts';
import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';

export function isQwenModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('qwen');
}

export function deriveModelName(modelId: string): string {
  const lastSlashIndex = modelId.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return modelId;
  }
  const name = modelId.slice(lastSlashIndex + 1);
  // Guard against trailing slash (e.g. "org/") by returning the full ID
  return name || modelId;
}

export function transformModel(id: string, maxModelLen: number | undefined): ModelV2 {
  const known = MODEL_CAPABILITIES[id];
  const isKnown = known !== undefined;
  const hasImageInput = isKnown && Boolean(known.modalities?.input.includes('image'));
  const reasoning = isKnown ? !id.endsWith('-fast') : false;

  const caps = {
    temperature: true,
    reasoning,
    attachment: hasImageInput,
    toolcall: true,
    input: {
      text: true as const,
      audio: false as const,
      image: hasImageInput,
      video: false as const,
      pdf: false as const,
    },
    output: {
      text: true as const,
      audio: false as const,
      image: false as const,
      video: false as const,
      pdf: false as const,
    },
    interleaved: false as const,
  };

  // Context comes from the API's max_model_len; output from the hardcoded map
  const context = maxModelLen ?? 131072;
  const output = isKnown ? known.limit.output : 32768;

  return {
    id,
    providerID: 'neuralwatt',
    api: {
      id,
      url: BASE_URL,
      npm: '@ai-sdk/openai-compatible',
    },
    name: deriveModelName(id),
    capabilities: caps,
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context, output },
    status: 'active',
    options: isKnown && known.options ? known.options : {},
    headers: {},
    release_date: '',
  };
}

export async function fetchModels(
  apiKey: string,
  logWarning: (msg: string) => void
): Promise<Record<string, ModelV2>> {
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${apiKey}`);
  const response = await fetch(`${BASE_URL}/models`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();

  if (!json || !Array.isArray(json.data)) {
    throw new Error('Invalid response: missing data array');
  }

  let invalidCount = 0;
  const models: Record<string, ModelV2> = {};

  for (const entry of json.data) {
    if (typeof entry !== 'object' || entry === null || typeof entry.id !== 'string') {
      invalidCount++;
      continue;
    }
    models[entry.id] = transformModel(entry.id, entry.max_model_len);
  }

  if (invalidCount > 0) {
    logWarning(`Skipped ${invalidCount} invalid model entries`);
  }

  return models;
}

export interface ConfigModelEntry {
  limit: { output: number };
  temperature: boolean;
  reasoning: boolean;
  attachment: boolean;
  tool_call: boolean;
  modalities?: {
    readonly input: readonly ('text' | 'image')[];
    readonly output: readonly 'text'[];
  };
  options?: Record<string, unknown>;
}

export function configModelsFromCapabilities(): Record<string, ConfigModelEntry> {
  const result: Record<string, ConfigModelEntry> = {};
  for (const [id, caps] of Object.entries(MODEL_CAPABILITIES)) {
    const isFast = id.endsWith('-fast');
    const hasImage = Boolean(caps.modalities?.input.includes('image'));
    result[id] = {
      limit: { output: caps.limit.output },
      temperature: true,
      reasoning: !isFast,
      attachment: hasImage,
      tool_call: true,
      ...(caps.modalities ? { modalities: caps.modalities } : {}),
      ...(caps.options ? { options: caps.options } : {}),
    };
  }
  return result;
}
