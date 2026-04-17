import { describe, it, expect, vi, afterEach } from 'vitest';

describe('NeuralWattPlugin auth hook', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('registers api auth method with correct provider', async () => {
    const { NeuralWattPlugin } = await import('../src/index');
    const mockClient = {
      tui: { showToast: vi.fn() },
    };
    const hooks = await NeuralWattPlugin({ client: mockClient } as any);
    expect(hooks.auth).toBeDefined();
    expect(hooks.auth!.provider).toBe('neuralwatt');
    expect(hooks.auth!.methods).toHaveLength(1);
    expect(hooks.auth!.methods[0].type).toBe('api');
    expect(hooks.auth!.methods[0].label).toBe('Enter NeuralWatt API key');
  });

  it('auth loader returns fetch that injects Bearer token', async () => {
    const { NeuralWattPlugin } = await import('../src/index');
    const mockClient = { tui: { showToast: vi.fn() } };
    const hooks = await NeuralWattPlugin({ client: mockClient } as any);

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
    const { NeuralWattPlugin } = await import('../src/index');
    const mockClient = { tui: { showToast: vi.fn() } };
    const hooks = await NeuralWattPlugin({ client: mockClient } as any);

    const mockAuth = vi
      .fn()
      .mockResolvedValue({ type: 'oauth', refresh: 'r', access: 'a', expires: 0 });
    await expect(hooks.auth!.loader!(mockAuth, {} as any)).rejects.toThrow('Unexpected auth type');
  });
});

describe('NeuralWattPlugin provider hook', () => {
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    const { _resetProviderCacheForTesting } = await import('../src/index');
    _resetProviderCacheForTesting();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('returns empty object when no auth present and no cache', async () => {
    const { NeuralWattPlugin } = await import('../src/index');
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: vi.fn() } } } as any);

    const result = await hooks.provider!.models({} as any, { auth: undefined } as any);
    expect(result).toEqual({});
  });

  it('returns empty object for non-api auth type with no cache', async () => {
    const { NeuralWattPlugin } = await import('../src/index');
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: vi.fn() } } } as any);

    const ctx = { auth: { type: 'oauth' as const, refresh: 'r', access: 'a', expires: 0 } };
    const result = await hooks.provider!.models({} as any, ctx as any);
    expect(result).toEqual({});
  });

  it('fetches models with API key and caches result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: 'test-model' }] }),
    }) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index');
    const mockToast = vi.fn();
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: mockToast } } } as any);

    const ctx = { auth: { type: 'api' as const, key: 'test-key' } };
    const result = await hooks.provider!.models({} as any, ctx as any);
    expect(Object.keys(result)).toContain('test-model');

    const result2 = await hooks.provider!.models({} as any, ctx as any);
    expect(Object.keys(result2)).toContain('test-model');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached models when auth removed after fetch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: 'cached-model' }] }),
    }) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index');
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: vi.fn() } } } as any);

    const ctx = { auth: { type: 'api' as const, key: 'key-a' } };
    await hooks.provider!.models({} as any, ctx as any);

    const result = await hooks.provider!.models({} as any, { auth: undefined } as any);
    expect(Object.keys(result)).toContain('cached-model');
  });

  it('cache is not keyed by API key: fetch with key A, then call with key B returns same cache', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ id: 'shared-model' }] }),
    }) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index');
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: vi.fn() } } } as any);

    const ctxA = { auth: { type: 'api' as const, key: 'key-a' } };
    await hooks.provider!.models({} as any, ctxA as any);

    const ctxB = { auth: { type: 'api' as const, key: 'key-b' } };
    const result = await hooks.provider!.models({} as any, ctxB as any);
    expect(Object.keys(result)).toContain('shared-model');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent models() calls to single fetch', async () => {
    let resolveFetch: (value: any) => void;
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    globalThis.fetch = vi.fn().mockReturnValue(fetchPromise) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index');
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: vi.fn() } } } as any);

    const ctx = { auth: { type: 'api' as const, key: 'test-key' } };
    const p1 = hooks.provider!.models({} as any, ctx as any);
    const p2 = hooks.provider!.models({} as any, ctx as any);

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

    const { NeuralWattPlugin } = await import('../src/index');
    const mockToast = vi.fn();
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: mockToast } } } as any);

    const ctx = { auth: { type: 'api' as const, key: 'bad-key' } };
    const result = await hooks.provider!.models({} as any, ctx as any);

    expect(result).toEqual({});

    await Promise.resolve();
    expect(mockToast).toHaveBeenCalled();
  });

  it('handles malformed JSON response by returning empty', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as unknown as typeof fetch;

    const { NeuralWattPlugin } = await import('../src/index');
    const mockToast = vi.fn();
    const hooks = await NeuralWattPlugin({ client: { tui: { showToast: mockToast } } } as any);

    const ctx = { auth: { type: 'api' as const, key: 'test-key' } };
    const result = await hooks.provider!.models({} as any, ctx as any);

    expect(result).toEqual({});
  });
});
