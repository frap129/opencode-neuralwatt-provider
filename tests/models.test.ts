import { describe, it, expect } from 'vitest';
import { isQwenModel, deriveName, transformModel } from '../src/models';
import { MODEL_CAPABILITIES } from '../src/constants';

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
