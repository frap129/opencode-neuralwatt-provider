import { describe, it, expect } from 'vitest';
import { isQwenModel, deriveName } from '../src/models';

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
