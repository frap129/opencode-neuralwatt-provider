import { describe, it, expect } from 'vitest';
import { BASE_URL, MODEL_CAPABILITIES, DEFAULT_CAPABILITIES } from '../src/constants.ts';

describe('constants', () => {
  it('has the correct BASE_URL', () => {
    expect(BASE_URL).toBe('https://api.neuralwatt.com/v1');
  });

  it('has DEFAULT_CAPABILITIES with expected limits', () => {
    expect(DEFAULT_CAPABILITIES.limit).toEqual({
      context: 131072,
      output: 32768,
    });
  });

  it('has MODEL_CAPABILITIES with known models', () => {
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.5-397B-A17B-FP8']).toBeDefined();
    expect(MODEL_CAPABILITIES['Qwen/Qwen3.5-397B-A17B-FP8'].limit.context).toBe(262144);
  });

  it('has MODEL_CAPABILITIES with modalities for Kimi-K2.5', () => {
    expect(MODEL_CAPABILITIES['moonshotai/Kimi-K2.5'].modalities).toEqual({
      input: ['text', 'image'],
      output: ['text'],
    });
  });

  it('does not have any -fast models in MODEL_CAPABILITIES', () => {
    const fastKeys = Object.keys(MODEL_CAPABILITIES).filter((k) => k.endsWith('-fast'));
    expect(fastKeys).toHaveLength(0);
  });

  it('every entry has valid limits where output <= context', () => {
    for (const [_id, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
      expect(capabilities.limit.context).toBeGreaterThan(0);
      expect(capabilities.limit.output).toBeGreaterThan(0);
      expect(capabilities.limit.output).toBeLessThanOrEqual(capabilities.limit.context);
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
