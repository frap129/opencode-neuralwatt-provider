import type { Plugin } from '@opencode-ai/plugin';
import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';
import { fetchModels, isQwenModel } from './models.ts';
import { BASE_URL } from './constants.ts';
import { cachedModels, fetchPromise, setCachedModels, setFetchPromise } from './cache.ts';

export const NeuralWattPlugin: Plugin = async ({ client }) => {
  function logError(message: string, error?: unknown): void {
    const errorStr = error instanceof Error ? error.toString() : String(error ?? '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)?.tui?.showToast?.({
      title: `[ERROR] ${message}`,
      message: errorStr,
      variant: 'error',
    });
  }

  function logWarning(message: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)?.tui?.showToast?.({
      message: `[WARNING] ${message}`,
      variant: 'warning',
    });
  }

  return {
    config: async (config) => {
      config.provider = config.provider ?? {};
      config.provider.neuralwatt = config.provider.neuralwatt ?? {
        npm: '@ai-sdk/openai-compatible',
        name: 'NeuralWatt',
        options: {
          baseURL: BASE_URL,
        },
      };
    },

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
            const headers = new Headers(input instanceof Request ? input.headers : undefined);
            if (init?.headers) {
              new Headers(init.headers).forEach((value, name) => {
                headers.set(name, value);
              });
            }
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
        if (cachedModels) {
          return cachedModels;
        }

        if (fetchPromise) {
          return fetchPromise;
        }

        if (!ctx.auth || ctx.auth.type !== 'api') {
          return {};
        }

        const promise = fetchModels(ctx.auth.key, logWarning)
          .then((models) => {
            setCachedModels(models);
            return models;
          })
          .catch((err) => {
            logError('Failed to fetch models', err);
            return {} as Record<string, ModelV2>;
          })
          .finally(() => {
            setFetchPromise(null);
          });

        setFetchPromise(promise);
        return promise;
      },
    },
    'experimental.chat.system.transform': async (input, output) => {
      const isQwen = isQwenModel(input.model.id);
      const hasMultiple = output.system.length > 1;

      if (isQwen && hasMultiple) {
        const nonEmpty = output.system.filter((s) => s.trim().length > 0);
        output.system = nonEmpty.length > 0 ? [nonEmpty.join('\n\n')] : [];
      }
    },
  };
};

export default NeuralWattPlugin;
