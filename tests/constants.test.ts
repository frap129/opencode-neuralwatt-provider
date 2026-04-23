import { describe, it, expect } from 'vitest';
import { BASE_URL, MODEL_CAPABILITIES } from '../src/constants.ts';

describe('constants', () => {
  it('has the correct BASE_URL', () => {
    expect(BASE_URL).toBe('https://api.neuralwatt.com/v1');
  });

  it('has MODEL_CAPABILITIES with known models', () => {
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.5-397B-A17B-FP8']).toBeDefined();
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.5-397B-A17B-FP8'].limit.output).toBe(32768);
  });

  it('has MODEL_CAPABILITIES with modalities for Kimi-K2.5', () => {
    expect(MODEL_CAPABILITIES['moonshotai/Kimi-K2.5'].modalities).toEqual({
      input: ['text', 'image'],
      output: ['text'],
    });
  });

  it('has MODEL_CAPABILITIES with modalities for Kimi-K2.6', () => {
    expect(MODEL_CAPABILITIES['moonshotai/Kimi-K2.6'].modalities).toEqual({
      input: ['text', 'image'],
      output: ['text'],
    });
  });

  it('has MODEL_CAPABILITIES with modalities for kimi-k2.6-fast', () => {
    expect(MODEL_CAPABILITIES['kimi-k2.6-fast'].modalities).toEqual({
      input: ['text', 'image'],
      output: ['text'],
    });
  });

  it('has MODEL_CAPABILITIES with modalities for Qwen3.6-35B-A3B', () => {
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.6-35B-A3B'].modalities).toEqual({
      input: ['text', 'image'],
      output: ['text'],
    });
  });

  it('has Qwen3.6-35B-A3B with correct output limit', () => {
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.6-35B-A3B'].limit).toEqual({
      output: 32768,
    });
  });

  it('does not have Qwen3.5-35B-A3B in MODEL_CAPABILITIES', () => {
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.5-35B-A3B']).toBeUndefined();
  });

  it('every entry has a valid output limit', () => {
    for (const [_id, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
      expect(capabilities.limit.output).toBeGreaterThan(0);
    }
  });

  it('every entry with modalities has text output', () => {
    for (const [, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
      if ('modalities' in capabilities && capabilities.modalities) {
        expect(capabilities.modalities.output).toEqual(['text']);
      }
    }
  });
});
