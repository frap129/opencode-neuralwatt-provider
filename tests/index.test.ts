import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Plugin } from '@opencode-ai/plugin';

// Typed test helpers to reduce `as any` usage
function makeClient(toast?: ReturnType<typeof vi.fn>) {
  return { tui: { showToast: toast ?? vi.fn() } };
}

function makeApiCtx(key: string) {
  return { auth: { type: 'api' as const, key } };
}

function makeOAuthCtx() {
  return { auth: { type: 'oauth' as const, refresh: 'r', access: 'a', expires: 0 } };
}

function mockFetchSuccess(data: Array<{ id: string }>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  }) as unknown as typeof fetch;
}

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
    const result = await hooks.auth!.loader!(mockAuth, {} as any);

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
    await expect(hooks.auth!.loader!(mockAuth, {} as any)).rejects.toThrow('Unexpected auth type');
  });
});

describe('NeuralWattPlugin provider hook', () => {
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    const { _resetProviderCacheForTesting } = await import('../src/index.ts');
    _resetProviderCacheForTesting();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('returns empty object when no auth present and no cache', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const result = await hooks.provider!.models!({} as any, { auth: undefined } as any);
    expect(result).toEqual({});
  });

  it('returns empty object for non-api auth type with no cache', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const result = await hooks.provider!.models!({} as any, makeOAuthCtx() as any);
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
    const result = await hooks.provider!.models!({} as any, ctx as any);
    expect(Object.keys(result)).toContain('test-model');

    const result2 = await hooks.provider!.models!({} as any, ctx as any);
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
    await hooks.provider!.models!({} as any, ctx as any);

    const result = await hooks.provider!.models!({} as any, { auth: undefined } as any);
    expect(Object.keys(result)).toContain('cached-model');
  });

  it('cache is not keyed by API key: fetch with key A, then call with key B returns same cache', async () => {
    globalThis.fetch = mockFetchSuccess([{ id: 'shared-model' }]);

    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const ctxA = makeApiCtx('key-a');
    await hooks.provider!.models!({} as any, ctxA as any);

    const ctxB = makeApiCtx('key-b');
    const result = await hooks.provider!.models!({} as any, ctxB as any);
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
    const p1 = hooks.provider!.models!({} as any, ctx as any);
    const p2 = hooks.provider!.models!({} as any, ctx as any);

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
    const result = await hooks.provider!.models!({} as any, ctx as any);

    expect(result).toEqual({});

    await Promise.resolve();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('[ERROR]'),
        variant: 'error',
        message: expect.stringContaining('Network error'),
      })
    );
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
    const result = await hooks.provider!.models!({} as any, ctx as any);

    expect(result).toEqual({});
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: 'error',
      })
    );
  });
});

describe('NeuralWattPlugin system transform hook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('merges multiple system messages for qwen models', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const output = { system: ['You are helpful.', 'Always be concise.'] };
    await hooks['experimental.chat.system.transform']!(
      { model: { id: 'Qwen/Qwen3.5-397B-A17B-FP8' } } as any,
      output
    );
    expect(output.system).toEqual(['You are helpful.\n\nAlways be concise.']);
  });

  it('is no-op for non-qwen models', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const output = { system: ['You are helpful.', 'Always be concise.'] };
    await hooks['experimental.chat.system.transform']!(
      { model: { id: 'moonshotai/Kimi-K2.5' } } as any,
      output
    );
    expect(output.system).toEqual(['You are helpful.', 'Always be concise.']);
  });

  it('is no-op when only one system message exists for qwen', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const output = { system: ['You are helpful.'] };
    await hooks['experimental.chat.system.transform']!(
      { model: { id: 'Qwen/Qwen3.5-397B-A17B-FP8' } } as any,
      output
    );
    expect(output.system).toEqual(['You are helpful.']);
  });

  it('handles empty system array for qwen', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const output = { system: [] as string[] };
    await hooks['experimental.chat.system.transform']!(
      { model: { id: 'Qwen/Qwen3.5-397B-A17B-FP8' } } as any,
      output
    );
    expect(output.system).toEqual([]);
  });

  it('filters empty strings before joining', async () => {
    const { NeuralWattPlugin } = await import('../src/index.ts');
    const hooks = await NeuralWattPlugin({
      client: makeClient(),
    } as unknown as Parameters<Plugin>[0]);

    const output = { system: ['Hello', '', '  ', 'World'] };
    await hooks['experimental.chat.system.transform']!(
      { model: { id: 'qwen-plus' } } as any,
      output
    );
    expect(output.system).toEqual(['Hello\n\nWorld']);
  });
});
