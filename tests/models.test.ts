import { describe, it, expect, vi, afterEach } from 'vitest';
import { isQwenModel, deriveName, transformModel, fetchModels } from '../src/models';

describe('isQwenModel', () => {
  it('returns true for model IDs containing qwen (case-insensitive)', () => {
    expect(isQwenModel('Qwen/Qwen3.5-397B-A17B-FP8')).toBe(true);
    expect(isQwenModel('qwen-plus')).toBe(true);
    expect(isQwenModel('QWEN-TURBO')).toBe(true);
  });

  it('returns false for non-Qwen model IDs', () => {
    expect(isQwenModel('moonshotai/Kimi-K2.5')).toBe(false);
    expect(isQwenModel('openai/gpt-oss-20b')).toBe(false);
    expect(isQwenModel('mistral-large')).toBe(false);
  });
});

describe('deriveName', () => {
  it('strips org prefix before slash', () => {
    const result = deriveName('Qwen/Qwen3.5-397B-A17B-FP8');
    expect(result).toBeTruthy();
    expect(result).not.toContain('/');
  });

  it('returns full ID when no slash', () => {
    expect(deriveName('gpt-oss-20b')).toBe('gpt-oss-20b');
  });

  it('returns non-empty string for any input', () => {
    expect(deriveName('some-model')).toBeTruthy();
  });
});

describe('transformModel', () => {
  it('returns correct shape for a known model', () => {
    const model = transformModel('Qwen/Qwen3.5-397B-A17B-FP8');
    expect(model.id).toBe('Qwen/Qwen3.5-397B-A17B-FP8');
    expect(model.providerID).toBe('neuralwatt');
    expect(model.api.id).toBe('Qwen/Qwen3.5-397B-A17B-FP8');
    expect(model.api.url).toBe('https://api.neuralwatt.com/v1');
    expect(model.api.npm).toBe('@ai-sdk/openai-compatible');
    expect(model.name).toBeTruthy();
    expect(model.capabilities.reasoning).toBe(true);
    expect(model.capabilities.toolcall).toBe(true);
    expect(model.capabilities.temperature).toBe(true);
    expect(model.limit.context).toBe(262144);
    expect(model.limit.output).toBe(32768);
    expect(model.status).toBe('active');
    expect(model.cost).toEqual({ input: 0, output: 0, cache: { read: 0, write: 0 } });
  });

  it('returns reasoning=true for known non-fast models', () => {
    const model = transformModel('Qwen/Qwen3.5-397B-A17B-FP8');
    expect(model.capabilities.reasoning).toBe(true);
  });

  it('returns reasoning=false for unknown models regardless of name', () => {
    const model = transformModel('unknown-model-fast');
    expect(model.capabilities.reasoning).toBe(false);
  });

  it('returns reasoning=false for unknown models even without -fast', () => {
    const model = transformModel('some-brand-new-model');
    expect(model.capabilities.reasoning).toBe(false);
  });

  it('returns conservative defaults for unknown models', () => {
    const model = transformModel('unknown/mystery-model');
    expect(model.capabilities.reasoning).toBe(false);
    expect(model.capabilities.attachment).toBe(false);
    expect(model.capabilities.toolcall).toBe(true);
    expect(model.capabilities.input).toEqual({
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    });
    expect(model.capabilities.output).toEqual({
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    });
    expect(model.limit.context).toBe(131072);
    expect(model.limit.output).toBe(32768);
  });

  it('sets attachment=true for models with image input modality', () => {
    const model = transformModel('moonshotai/Kimi-K2.5');
    expect(model.capabilities.attachment).toBe(true);
    expect(model.capabilities.input.image).toBe(true);
  });

  it('sets interleaved to false', () => {
    const model = transformModel('Qwen/Qwen3.5-397B-A17B-FP8');
    expect(model.capabilities.interleaved).toBe(false);
  });

  it('sets toolcall=true for both known and unknown models', () => {
    expect(transformModel('Qwen/Qwen3.5-397B-A17B-FP8').capabilities.toolcall).toBe(true);
    expect(transformModel('totally-unknown-model').capabilities.toolcall).toBe(true);
  });
});

describe('fetchModels', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches and transforms models from API', async () => {
    const mockResponse = {
      data: [
        { id: 'Qwen/Qwen3.5-397B-A17B-FP8', object: 'model' },
        { id: 'moonshotai/Kimi-K2.5', object: 'model' },
      ],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const warnings: string[] = [];
    const result = await fetchModels('test-key', (msg) => warnings.push(msg));

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Qwen/Qwen3.5-397B-A17B-FP8']).toBeDefined();
    expect(result['moonshotai/Kimi-K2.5']).toBeDefined();
    expect(warnings).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.neuralwatt.com/v1/models',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer test-key');
  });

  it('skips invalid entries and logs aggregated warning', async () => {
    const mockResponse = {
      data: [
        { id: 'valid-model', object: 'model' },
        { object: 'model' },
        { id: 123, object: 'model' },
        null,
        { id: 'another-valid', object: 'model' },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    }) as unknown as typeof fetch;

    const warnings: string[] = [];
    const result = await fetchModels('test-key', (msg) => warnings.push(msg));

    expect(Object.keys(result)).toHaveLength(2);
    expect(result['valid-model']).toBeDefined();
    expect(result['another-valid']).toBeDefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toBe('Skipped 3 invalid model entries');
  });

  it('throws on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await expect(fetchModels('bad-key', vi.fn())).rejects.toThrow('Failed to fetch models');
  });

  it('throws on malformed JSON response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    }) as unknown as typeof fetch;

    await expect(fetchModels('key', vi.fn())).rejects.toThrow();
  });

  it('throws when response has no data array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ models: [] }),
    }) as unknown as typeof fetch;

    await expect(fetchModels('key', vi.fn())).rejects.toThrow('Invalid response');
  });

  it('throws when response data is null', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: null }),
    }) as unknown as typeof fetch;

    await expect(fetchModels('key', vi.fn())).rejects.toThrow('Invalid response');
  });

  it('handles empty data array', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    }) as unknown as typeof fetch;

    const result = await fetchModels('key', vi.fn());
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('last duplicate ID wins', async () => {
    const mockResponse = {
      data: [
        { id: 'same-model', object: 'model' },
        { id: 'same-model', object: 'model' },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockResponse),
    }) as unknown as typeof fetch;

    const result = await fetchModels('key', vi.fn());
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['same-model']).toBeDefined();
  });
});
