import { BASE_URL, DEFAULT_CAPABILITIES, MODEL_CAPABILITIES } from './constants.ts';
import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';

export function isQwenModel(modelId: string): boolean {
  return modelId.toLowerCase().includes('qwen');
}

export function deriveName(id: string): string {
  const slashIndex = id.indexOf('/');
  return slashIndex >= 0 ? id.slice(slashIndex + 1) : id;
}

export function transformModel(id: string): ModelV2 {
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

  return {
    id,
    providerID: 'neuralwatt',
    api: {
      id,
      url: BASE_URL,
      npm: '@ai-sdk/openai-compatible',
    },
    name: deriveName(id),
    capabilities: caps,
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: isKnown ? known.limit : DEFAULT_CAPABILITIES.limit,
    status: 'active',
    options: {},
    headers: {},
    release_date: '',
  };
}
