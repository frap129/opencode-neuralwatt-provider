import type { Plugin } from '@opencode-ai/plugin';
import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';
import { fetchModels } from './models.ts';

let opencode: Parameters<Plugin>[0]['client'] | null = null;
let cachedModels: Record<string, ModelV2> | null = null;
let fetchPromise: Promise<Record<string, ModelV2>> | null = null;

function logError(message: string, error?: unknown): void {
  const errorStr = error instanceof Error ? error.toString() : String(error ?? '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (opencode as any)?.tui?.showToast?.({
    title: `[ERROR] ${message}`,
    message: errorStr,
    variant: 'error',
  });
}

function logWarning(message: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (opencode as any)?.tui?.showToast?.({
    message: `[WARNING] ${message}`,
    variant: 'warning',
  });
}

export function _resetProviderCacheForTesting(): void {
  cachedModels = null;
  fetchPromise = null;
}

export const NeuralWattPlugin: Plugin = async ({ client }) => {
  opencode = client;

  return {
    auth: {
      provider: 'neuralwatt',
      loader: async (auth) => {
        const credentials = await auth();
        if (credentials.type !== 'api') {
          throw new Error('Unexpected auth type');
        }
        const { key } = credentials;
        return {
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            headers.set('Authorization', `Bearer ${key}`);
            return fetch(input, { ...init, headers });
          },
        };
      },
      methods: [
        {
          type: 'api' as const,
          label: 'Enter NeuralWatt API key',
          prompts: [
            {
              type: 'text' as const,
              key: 'key',
              message: 'API Key',
              placeholder: 'nw-...',
            },
          ],
        },
      ],
    },

    provider: {
      id: 'neuralwatt',
      models: async (_provider, ctx) => {
        if (!ctx.auth || ctx.auth.type !== 'api') {
          return cachedModels ?? {};
        }

        if (cachedModels) {
          return cachedModels;
        }

        if (!fetchPromise) {
          fetchPromise = fetchModels(ctx.auth.key, logWarning)
            .then((models) => {
              cachedModels = models;
              return models;
            })
            .catch((err) => {
              logError('Failed to fetch models', err);
              return {} as Record<string, ModelV2>;
            })
            .finally(() => {
              fetchPromise = null;
            });
        }

        return fetchPromise;
      },
    },

    'experimental.chat.system.transform': async () => {
      // Stub — real implementation in Task 8
    },
  };
};
