---
name: adding-neuralwatt-models
description: Use when Neuralwatt adds a new model to the provider and constants need updating in src/constants.ts. Triggers on phrases like "Neuralwatt added [model]", "are there constants to add", or "new model available".
---

# Adding Neuralwatt Models

## Overview

When Neuralwatt adds a new model, add it to `_MODEL_CAPABILITIES` in `src/constants.ts` so it gets correct output limits, modalities, and reasoning rather than conservative defaults. Fast variants go in the map too — reasoning is disabled automatically by `transformModel()`.

## Core Principle

**Never add constants without verifying the model exists in the API first.**

## Process

### Step 1: Verify model exists

```bash
opencode models --refresh | grep neuralwatt
```

Only proceed if the model appears. Cross-reference the API ID to the key format:
- `neuralwatt/moonshotai/Kimi-K2.6` → key `moonshotai/Kimi-K2.6`
- `neuralwatt/kimi-k2.6-fast` → key `kimi-k2.6-fast`

### Step 2: Research capabilities

For **output token limit**, search the model's official API docs (`platform.kimi.ai/docs`, OpenRouter, Hugging Face). Check sibling models (e.g., K2.6 has same output limit as K2.5: 32768). Only default to 32768 as fallback.

For **modalities**, if the model supports vision/multimodal, add `modalities: { input: ['text', 'image'] as const, output: ['text'] as const }`.

### Step 3: Add to constants.ts and tests

Add the base model to the `_MODEL_CAPABILITIES` object, grouped near related models. If the API has a `-fast` variant, add it with **identical capabilities** — reasoning is handled automatically.

```typescript
'moonshotai/Kimi-K2.6': {
  limit: { output: 32768 },
  modalities: { input: ['text', 'image'] as const, output: ['text'] as const },
},
'kimi-k2.6-fast': {
  limit: { output: 32768 },
  modalities: { input: ['text', 'image'] as const, output: ['text'] as const },
},
```

In `tests/constants.test.ts`, add assertions for modalities and output limits. In `tests/models.test.ts`, add tests for `reasoning=true` (base), `reasoning=false` (fast), and `attachment=true`/`input.image=true` if multimodal.

### Step 4: Run tests and commit

```bash
mise run test
```

All tests must pass. Commit base model and fast variant together in one commit. Existing fast variants for other models go in a separate commit.

## Quick Reference

| Question | Answer |
|----------|--------|
| Verify model exists? | `opencode models --refresh \| grep neuralwatt` |
| Output limit source? | Official API docs; default 32768 as fallback |
| Fast model reasoning? | Automatic: `!id.endsWith('-fast')` in `transformModel()` |
| Fast model capabilities? | Identical to base (same modalities, same output limit) |

## Common Mistakes

- **Adding constants without verifying API presence** — always check `opencode models --refresh` first
- **Guessing output limit** — research official docs
- **Skipping the fast variant** — if it's in the API, it needs an entry
- **Making fast models text-only** — same modalities as base
- **Not running tests** — always `mise run test` before committing
