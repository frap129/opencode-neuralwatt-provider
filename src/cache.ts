import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';

export let cachedModels: Record<string, ModelV2> | null = null;
export let fetchPromise: Promise<Record<string, ModelV2>> | null = null;

export function _resetProviderCacheForTesting(): void {
  cachedModels = null;
  fetchPromise = null;
}

export function setCachedModels(models: Record<string, ModelV2>): void {
  cachedModels = models;
}

export function setFetchPromise(promise: Promise<Record<string, ModelV2>> | null): void {
  fetchPromise = promise;
}
