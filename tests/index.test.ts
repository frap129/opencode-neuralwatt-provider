import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Plugin, ProviderHookContext } from '@opencode-ai/plugin';
import type { Provider } from '@opencode-ai/sdk';
import type { Provider as ProviderV2, Model } from '@opencode-ai/sdk/v2';

// Typed test helpers - using `as unknown as T` for intentional partial test data
function makeClient(toast?: ReturnType<typeof vi.fn>) {
  return { tui: { showToast: toast ?? vi.fn() } };
}

function makeApiCtx(key: string): ProviderHookContext {
  return { auth: { type: 'api' as const, key } };
}

function makeOAuthCtx(): ProviderHookContext {
  return { auth: { type: 'oauth' as const, refresh: 'r', access: 'a', expires: 0 } };
}

function makeNoAuthCtx(): ProviderHookContext {
  return { auth: undefined };
}

function makeEmptyProvider(): ProviderV2 {
  return {} as unknown as ProviderV2;
}

function makeEmptyLegacyProvider(): Provider {
  return {} as unknown as Provider;
}

function _makeModelInput(modelId: string): { sessionID?: string; model: Model } {
  return { model: { id: modelId } as unknown as Model };
}

function mockFetchSuccess(data: Array<{ id: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  }) as unknown as typeof fetch;
}

describe('module exports', () => {
  it('exports v1 PluginModule shape with id and server', async () => {
    const mod = await import('../src/index.ts');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('object');
    expect(mod.default.id).toBe('opencode-neuralwatt-provider');
    expect(typeof mod.default.server).toBe('function');
  });
});

describe('NeuralWattPlugin auth hook', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('registers api auth method with correct provider', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);
    expect(hooks.auth).toBeDefined();
    expect(hooks.auth!.provider).toBe('neuralwatt');
    expect(hooks.auth!.methods).toHaveLength(1);
    expect(hooks.auth!.methods[0].type).toBe('api');
    expect(hooks.auth!.methods[0].label).toBe('Enter NeuralWatt API key');
  });

  it('auth loader returns fetch that injects Bearer token', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const mockAuth = vi.fn().mockResolvedValue({ type: 'api', key: 'test-api-key' });
    const result = await hooks.auth!.loader!(mockAuth, makeEmptyLegacyProvider());

    expect(result.fetch).toBeDefined();
    const realFetch = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = realFetch as unknown as typeof fetch;

    await result.fetch('https://example.com/api', {});
    expect(realFetch).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const callArgs = realFetch.mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-api-key');
  });

  it('auth loader throws for non-api auth type', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const mockAuth = vi
      .fn()
      .mockResolvedValue({ type: 'oauth', refresh: 'r', access: 'a', expires: 0 });
    await expect(hooks.auth!.loader!(mockAuth, makeEmptyLegacyProvider())).rejects.toThrow(
      'Unexpected auth type'
    );
  });
});

describe('NeuralWattPlugin provider hook', () => {
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    const { _resetProviderCacheForTesting } = await import('../src/cache.ts');
    _resetProviderCacheForTesting();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('returns empty object when no auth present and no cache', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const result = await hooks.provider!.models!(makeEmptyProvider(), makeNoAuthCtx());
    expect(result).toEqual({});
  });

  it('returns empty object for non-api auth type with no cache', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const result = await hooks.provider!.models!(makeEmptyProvider(), makeOAuthCtx());
    expect(result).toEqual({});
  });

  it('fetches models with API key and caches result', async () => {
    globalThis.fetch = mockFetchSuccess([{ id: 'test-model' }]);

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockToast = vi.fn();
    const hooks = await NeuralWattPlugin({
      client: makeClient(mockToast),
    } as unknown as Parameters<Plugin>[0]);

    const ctx = makeApiCtx('test-key');
    const result = await hooks.provider!.models!(makeEmptyProvider(), ctx);
    expect(Object.keys(result)).toContain('test-model');

    const result2 = await hooks.provider!.models!(makeEmptyProvider(), ctx);
    expect(Object.keys(result2)).toContain('test-model');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached models when auth removed after fetch', async () => {
    globalThis.fetch = mockFetchSuccess([{ id: 'cached-model' }]);

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const ctx = makeApiCtx('key-a');
    await hooks.provider!.models!(makeEmptyProvider(), ctx);

    const result = await hooks.provider!.models!(makeEmptyProvider(), makeNoAuthCtx());
    expect(Object.keys(result)).toContain('cached-model');
  });

  it('cache is not keyed by API key: fetch with key A, then call with key B returns same cache', async () => {
    globalThis.fetch = mockFetchSuccess([{ id: 'shared-model' }]);

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const ctxA = makeApiCtx('key-a');
    await hooks.provider!.models!(makeEmptyProvider(), ctxA);

    const ctxB = makeApiCtx('key-b');
    const result = await hooks.provider!.models!(makeEmptyProvider(), ctxB);
    expect(Object.keys(result)).toContain('shared-model');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent models() calls to single fetch', async () => {
    let resolveFetch: (value: unknown) => void;
    const pendingFetch = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    globalThis.fetch = vi.fn().mockReturnValue(pendingFetch) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const ctx = makeApiCtx('test-key');
    const p1 = hooks.provider!.models!(makeEmptyProvider(), ctx);
    const p2 = hooks.provider!.models!(makeEmptyProvider(), ctx);

    resolveFetch!({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: 'concurrent-model' }] }),
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(Object.keys(r1)).toContain('concurrent-model');
    expect(Object.keys(r2)).toContain('concurrent-model');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty on fetch failure and logs error via showToast', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('Network error')) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockToast = vi.fn();
    const hooks = await NeuralWattPlugin({
      client: makeClient(mockToast),
    } as unknown as Parameters<Plugin>[0]);

    const ctx = makeApiCtx('bad-key');
    const result = await hooks.provider!.models!(makeEmptyProvider(), ctx);

    expect(result).toEqual({});

    await Promise.resolve();
    expect(mockToast).toHaveBeenCalledWith({
      body: expect.objectContaining({
        title: expect.stringContaining('[ERROR]'),
        variant: 'error',
        message: expect.stringContaining('Network error'),
      }),
    });
  });

  it('handles malformed JSON response by returning empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockToast = vi.fn();
    const hooks = await NeuralWattPlugin({
      client: makeClient(mockToast),
    } as unknown as Parameters<Plugin>[0]);

    const ctx = makeApiCtx('test-key');
    const result = await hooks.provider!.models!(makeEmptyProvider(), ctx);

    expect(result).toEqual({});
    expect(mockToast).toHaveBeenCalledWith({
      body: expect.objectContaining({
        variant: 'error',
      }),
    });
  });
});

describe('NeuralWattPlugin config hook', () => {
  it('calls client.config.update when neuralwatt not configured', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const hooks = await NeuralWattPlugin({
      client: { tui: { showToast: vi.fn() }, config: { update: mockUpdate } },
    } as unknown as Parameters<Plugin>[0]);

    const cfg: Record<string, unknown> = {};
    await hooks.config!(cfg as Parameters<NonNullable<typeof hooks.config>>[0]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // In-place mutation still works for backward compat
    expect((cfg as Record<string, unknown>).provider).toBeDefined();
  });

  it('calls client.config.update when provider key exists but neuralwatt missing', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const hooks = await NeuralWattPlugin({
      client: { tui: { showToast: vi.fn() }, config: { update: mockUpdate } },
    } as unknown as Parameters<Plugin>[0]);

    const cfg: Record<string, unknown> = { provider: { anthropic: {} } };
    await hooks.config!(cfg as Parameters<NonNullable<typeof hooks.config>>[0]);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('skips update when neuralwatt provider already configured with npm', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockUpdate = vi.fn().mockResolvedValue(undefined);
    const hooks = await NeuralWattPlugin({
      client: { tui: { showToast: vi.fn() }, config: { update: mockUpdate } },
    } as unknown as Parameters<Plugin>[0]);

    const cfg: Record<string, unknown> = {
      provider: { neuralwatt: { npm: '@ai-sdk/openai-compatible', name: 'NeuralWatt' } },
    };
    await hooks.config!(cfg as Parameters<NonNullable<typeof hooks.config>>[0]);

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('does not throw when client.config.update fails', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const mockToast = vi.fn();
    const mockUpdate = vi.fn().mockRejectedValue(new Error('Server not ready'));
    const hooks = await NeuralWattPlugin({
      client: { tui: { showToast: mockToast }, config: { update: mockUpdate } },
    } as unknown as Parameters<Plugin>[0]);

    const cfg: Record<string, unknown> = {};
    await expect(
      hooks.config!(cfg as Parameters<NonNullable<typeof hooks.config>>[0])
    ).resolves.toBeUndefined();

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
