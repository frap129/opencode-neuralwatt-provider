import type { Plugin } from '@opencode-ai/plugin';
import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';
import { fetchModels, isQwenModel, configModelsFromCapabilities } from './models.ts';
import { BASE_URL } from './constants.ts';
import { cachedModels, fetchPromise, setCachedModels, setFetchPromise } from './cache.ts';

export const NeuralWattPlugin: Plugin = async ({ client }) => {
  function logError(message: string, error?: unknown): void {
    const errorStr = error instanceof Error ? error.toString() : String(error ?? '');
    client.tui.showToast({
      body: {
        title: `[ERROR] ${message}`,
        message: errorStr,
        variant: 'error',
      },
    });
  }

  function logWarning(message: string): void {
    client.tui.showToast({
      body: {
        message: `[WARNING] ${message}`,
        variant: 'warning',
      },
    });
  }

  return {
    config: async (config) => {
      config.provider = config.provider ?? {};
      const needsUpdate = !config.provider.neuralwatt?.npm;

      // In-place mutation for backward compatibility with pre-v1.14 OpenCode
      config.provider.neuralwatt = config.provider.neuralwatt ?? {
        npm: '@ai-sdk/openai-compatible',
        name: 'NeuralWatt',
        options: {
          baseURL: BASE_URL,
        },
      };

      // Persist via client API for OpenCode v1.14+ compatibility.
      // The in-place mutation above is discarded by v1.14's immutable config service.
      if (needsUpdate) {
        await client.config
          .update({
            body: {
              provider: {
                neuralwatt: {
                  npm: '@ai-sdk/openai-compatible',
                  name: 'NeuralWatt',
                  options: {
                    baseURL: BASE_URL,
                  },
                  models: configModelsFromCapabilities() as Record<string, unknown>,
                },
              },
            },
          } as Parameters<typeof client.config.update>[0])
          .catch(() => {
            // Silently ignore — update may fail if server is not ready
            // or another transient error occurs.
          });
      }
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

            let modifiedInit = init;

            // Qwen models on vLLM require exactly one system message at the beginning
            if (init?.body && typeof init.body === 'string') {
              try {
                const body = JSON.parse(init.body);
                if (body.model && isQwenModel(body.model) && Array.isArray(body.messages)) {
                  const systemMsgs = body.messages.filter(
                    (m: { role: string }) => m.role === 'system'
                  );
                  const otherMsgs = body.messages.filter(
                    (m: { role: string }) => m.role !== 'system'
                  );

                  // Merge all system messages into one
                  if (systemMsgs.length > 1) {
                    const mergedContent = systemMsgs
                      .map((m: { content: string }) => m.content)
                      .filter((c: string) => c.trim().length > 0)
                      .join('\n\n');
                    body.messages = [{ role: 'system', content: mergedContent }, ...otherMsgs];
                    modifiedInit = { ...init, body: JSON.stringify(body) };
                  }
                }
              } catch {
                // If JSON parsing fails, use original body
              }
            }

            return fetch(input, { ...modifiedInit, headers });
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
  };
};

export default {
  id: 'opencode-neuralwatt-provider',
  server: NeuralWattPlugin,
};
