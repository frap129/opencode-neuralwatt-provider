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
