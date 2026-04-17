import type { Plugin } from '@opencode-ai/plugin';
import type { Model as ModelV2 } from '@opencode-ai/sdk/v2';

let opencode: Parameters<Plugin>[0]['client'] | null = null;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logError(message: string, error?: unknown): void {
  const errorStr = error instanceof Error ? error.message : String(error ?? '');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (opencode as any)?.tui?.showToast?.({
    title: `[ERROR] ${message}`,
    message: errorStr,
    variant: 'error',
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logWarning(message: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (opencode as any)?.tui?.showToast?.({
    message: `[WARNING] ${message}`,
    variant: 'warning',
  });
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
      models: async () => {
        // Stub — real implementation in Task 7
        return {} as Record<string, ModelV2>;
      },
    },

    'experimental.chat.system.transform': async () => {
      // Stub — real implementation in Task 8
    },
  };
};
