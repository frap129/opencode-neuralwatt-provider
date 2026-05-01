# NeuralWatt Provider Plugin Spec

## Overview

An OpenCode plugin that provides full NeuralWatt provider support with zero manual configuration. Users install the plugin, authenticate once, and all NeuralWatt models become available automatically.

## Goals

- Dynamic model discovery from NeuralWatt API
- API key authentication via OpenCode's auth system
- Automatic system message merging for Qwen models (single system message requirement)
- No manual model configuration required

## Architecture

The plugin exports `NeuralWattPlugin` which returns three hooks:

1. **`auth`** - API key authentication for `neuralwatt` provider
2. **`provider`** - Provider registration with dynamic model fetching
3. **`experimental.chat.system.transform`** - System message merging for Qwen models

## Components

### Constants (`src/constants.ts`)

```ts
export const BASE_URL = 'https://api.neuralwatt.com/v1';

// Model capabilities that cannot be inferred from the /v1/models endpoint
export interface ModelCapabilities {
  limit: { context: number; output: number };
  modalities?: { input: Array<'text' | 'image'>; output: Array<'text'> };
}

export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  limit: { context: 131072, output: 32768 },
};

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  'Qwen/Qwen3.5-397B-A17B-FP8': {
    limit: { context: 262144, output: 32768 },
  },
  'moonshotai/Kimi-K2.5': {
    limit: { context: 262144, output: 32768 },
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'zai-org/GLM-5.1-FP8': {
    limit: { context: 202752, output: 65536 },
  },
  'zai-org/GLM-5-FP8': {
    limit: { context: 202752, output: 65536 },
  },
  'MiniMaxAI/MiniMax-M2.5': {
    limit: { context: 196608, output: 65536 },
  },
  'mistralai/Devstral-Small-2-24B-Instruct-2512': {
    limit: { context: 262144, output: 65536 },
    modalities: { input: ['text', 'image'], output: ['text'] },
  },
  'Qwen/Qwen3.5-35B-A3B': {
    limit: { context: 131072, output: 32768 },
  },
  'openai/gpt-oss-20b': {
    limit: { context: 16384, output: 8192 },
  },
};
```

### Models (`src/models.ts`)

Responsible for fetching and transforming models.

**`fetchModels(apiKey: string, logWarning: (msg: string) => void): Promise<Record<string, ModelV2>>`**

- GET `{BASE_URL}/models` with `Authorization: Bearer {apiKey}`
- Throws on non-200 response
- Parse JSON response, validate structure:
  - Response must have `data` property that is an array (throws if not)
  - Each entry in `data` must have a string `id` property
  - Invalid entries (missing/non-string `id`) are **skipped** and logged via `logWarning()` (one aggregated message: "Skipped N invalid model entries")
  - Duplicate IDs: last occurrence wins
- Transform each valid model ID to full ModelV2 format
- Return as `Record<string, ModelV2>` keyed by model ID

The `logWarning` callback is passed from `index.ts` and uses `showToast({ ..., variant: 'warning' })`.

**`transformModel(id: string): ModelV2`**

Returns a complete ModelV2 object. For **known models** (in `MODEL_CAPABILITIES`), capabilities are set based on the map. For **unknown models**, capabilities use conservative defaults to avoid advertising unsupported features.

```ts
// Known model (in MODEL_CAPABILITIES)
{
  id: string;                    // Model ID from API
  providerID: 'neuralwatt';
  api: {
    id: string;                  // Same as model ID (used for inference)
    url: BASE_URL;
    npm: '@ai-sdk/openai-compatible';
  };
  name: string;                  // Derived display name
  capabilities: {
    temperature: true;           // All NeuralWatt models support temperature
    reasoning: boolean;          // true unless ID ends with '-fast'
    attachment: boolean;         // true if modalities includes 'image'
    toolcall: true;              // All known models support tool calls
    input: { text: true, audio: false, image: boolean, video: false, pdf: false };
    output: { text: true, audio: false, image: false, video: false, pdf: false };
    interleaved: false;
  };
  cost: { input: 0, output: 0, cache: { read: 0, write: 0 } };
  limit: { context, output };    // From MODEL_CAPABILITIES
  status: 'active';
  options: {};
  headers: {};
  release_date: '';
}

// Unknown model (not in MODEL_CAPABILITIES)
// NeuralWatt's OpenAI-compatible API guarantees tool calling support for all models
{
  // ... same structure, but:
  capabilities: {
    temperature: true;           // Safe assumption
    reasoning: false;            // Conservative: don't advertise reasoning
    attachment: false;           // Conservative: text-only
    toolcall: true;              // NeuralWatt API guarantees tool support
    input: { text: true, audio: false, image: false, video: false, pdf: false };
    output: { text: true, audio: false, image: false, video: false, pdf: false };
    interleaved: false;
  };
  limit: DEFAULT_CAPABILITIES.limit;  // Conservative context limit
}
```

**Reasoning detection (known models only):**

- For models in `MODEL_CAPABILITIES`: `reasoning = !modelId.endsWith('-fast')`
- For unknown models: `reasoning = false` (conservative default)

**Name derivation (best-effort):**

Display names are derived from model IDs using simple heuristics. The exact formatting is not guaranteed and may evolve. Tests should verify names are non-empty and reasonably readable, not exact string matches.

Basic rules:

- Strip org prefix before `/` (e.g., `Qwen/Qwen3.5-397B` -> `Qwen3.5-397B`)
- The resulting string becomes the display name

More sophisticated formatting (spacing, removing suffixes like `-FP8`) is optional and may be added later.

### Plugin (`src/index.ts`)

**Initialization:**

```ts
let cachedModels: Record<string, ModelV2> | null = null;
let fetchPromise: Promise<Record<string, ModelV2>> | null = null;
```

- Fetch models once on first `models()` call, cache indefinitely
- Use `fetchPromise` to dedupe concurrent calls during initial fetch
- Cache is **not** keyed by API key and persists until OpenCode restart
- If auth is removed after successful fetch, cached models remain available (acceptable tradeoff for simplicity)
- To refresh models, restart OpenCode

**Auth Hook:**

The auth hook only supports API key authentication. The `loader` function receives an `auth` callback that returns the stored credentials. Since we register only `type: 'api'` methods, the returned auth will always be `{ type: 'api', key: string }`.

```ts
auth: {
  provider: 'neuralwatt',
  loader: async (auth) => {
    const credentials = await auth();
    if (credentials.type !== 'api') {
      throw new Error('Unexpected auth type');
    }
    const { key } = credentials;
    return {
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set('Authorization', `Bearer ${key}`);
        return fetch(input, { ...init, headers });
      },
    };
  },
  methods: [{
    type: 'api',
    label: 'Enter NeuralWatt API key',
    prompts: [{
      type: 'text',
      key: 'key',
      message: 'API Key',
      placeholder: 'nw-...',
    }],
  }],
}
```

**Provider Hook:**

The provider hook extracts the API key from `ctx.auth` when available. Since we only register API key auth, we expect `ctx.auth` to have shape `{ type: 'api', key: string }` when present.

Errors are logged via OpenCode's client API (passed to plugin via `PluginInput`).

```ts
// Module-level reference set during plugin init
let opencode: PluginInput['client'] | null = null;

function logError(message: string, error?: unknown): void {
  const errorStr = error instanceof Error ? error.message : String(error ?? '');
  opencode?.tui?.showToast?.({
    title: `[ERROR] ${message}`,
    message: errorStr,
    variant: 'error',
  });
}

function logWarning(message: string): void {
  opencode?.tui?.showToast?.({
    message: `[WARNING] ${message}`,
    variant: 'warning',
  });
}

// In plugin function:
export const NeuralWattPlugin: Plugin = async ({ client }) => {
  opencode = client;
  // ...
};

provider: {
  id: 'neuralwatt',
  models: async (provider, ctx) => {
    // No auth present - return cached or empty
    if (!ctx.auth || ctx.auth.type !== 'api') {
      return cachedModels ?? {};
    }

    // Already cached - return immediately
    if (cachedModels) {
      return cachedModels;
    }

    // Dedupe concurrent calls
    if (!fetchPromise) {
      fetchPromise = fetchModels(ctx.auth.key, logWarning)
        .then((models) => {
          cachedModels = models;
          return models;
        })
        .catch((err) => {
          logError('Failed to fetch models', err);
          return {};
        })
        .finally(() => {
          fetchPromise = null;
        });
    }

    return fetchPromise;
  },
}
```

The provider hook registers the `neuralwatt` provider. OpenCode merges plugin-provided models with any user config overrides (`provider.neuralwatt.models.*`). User config takes precedence, allowing users to override limits, capabilities, or add models not in the API.

**System Transform Hook:**

```ts
'experimental.chat.system.transform': async (input, output) => {
  const isQwen = input.model.id.toLowerCase().includes('qwen');
  const hasMultipleMessages = output.system.length > 1;

  if (isQwen && hasMultipleMessages) {
    const nonEmpty = output.system.filter((s) => s.trim().length > 0);
    output.system = nonEmpty.length > 0 ? [nonEmpty.join('\n\n')] : [];
  }
}
```

Only merges when:

1. Model ID contains 'qwen' (case-insensitive)
2. More than one system message exists
3. Filters out empty messages before joining

## Package Structure

```
src/
  index.ts       # Plugin export and hooks
  models.ts      # Model fetching and transformation
  constants.ts   # Base URL, capability map, defaults
```

## Dependencies

- `@opencode-ai/plugin` (dev dependency for `Plugin` type and hook definitions)
- `@opencode-ai/sdk` (dev dependency for `Model` type, imported as `ModelV2` via `@opencode-ai/sdk/v2`)

## Usage

1. Install: `bun add opencode-neuralwatt-provider`
2. Add to config: `"plugin": ["opencode-neuralwatt-provider"]`
3. Authenticate via OpenCode when prompted
4. All NeuralWatt models available automatically

## Error Handling

Errors are logged via OpenCode's `client.tui.showToast()` with `[ERROR]` prefix (no `console.*` due to lint rules).

**In `models()` hook:**

- **Network error**: Caught in `fetchPromise`, logs error, returns `{}`
- **Non-200 response**: `fetchModels()` throws, caught by `models()`, logged, returns `{}`
- **Malformed JSON**: `fetchModels()` throws on parse, caught by `models()`, logged, returns `{}`
- **Missing/invalid `data` array**: `fetchModels()` throws, caught by `models()`, logged, returns `{}`
- **No auth present**: Return `cachedModels ?? {}` (cached models if available, else empty)

**In `fetchModels()`:**

- **Invalid model entries** (missing/non-string `id`): Skipped, aggregated warning logged via `logWarning()` (e.g., "Skipped 3 invalid model entries")
- **Duplicate IDs**: Last occurrence wins (no error)

**In `auth.loader`:**

- **Auth failure**: OpenCode's standard auth error handling applies
- **Network errors in custom fetch**: Propagate to caller (OpenCode handles retry/display)

## Testing

Unit tests:

- `transformModel()` with known model IDs (correct capabilities from map)
- `transformModel()` with unknown model IDs (conservative defaults)
- Known models ending in `-fast`: `reasoning: false`
- Known models not ending in `-fast`: `reasoning: true`
- Unknown models: `reasoning: false` regardless of name
- Name derivation: returns non-empty readable name from model ID
- Capability lookup: known models get correct limits/modalities
- Capability lookup: unknown models get conservative defaults

System message transform tests:

- No-op when model is not Qwen
- No-op when only one system message exists
- Merges multiple messages with `\n\n` separator
- Handles empty system array (returns empty)
- Filters empty strings before joining

Provider hook tests:

- No auth present, no cache: returns `{}`
- No auth present, cache exists: returns cached models
- Non-API auth type: returns cached or empty
- Concurrent `models()` calls only trigger one fetch
- After successful fetch, subsequent calls return cached result immediately
- Cache not keyed by API key: fetch with key A, then call with key B, returns cached models (no refetch)
- Fetch failure: logs error via toast, returns `{}`

Integration tests:

- Mock `/v1/models` returning valid response
- Mock `/v1/models` returning empty `{ data: [] }`
- Mock `/v1/models` returning non-200 status (logs error, returns `{}`)
- Mock `/v1/models` returning malformed JSON (logs error, returns `{}`)
- Mock `/v1/models` returning `{ data: null }` (logs error, returns `{}`)
- Mock `/v1/models` returning entries with missing `id` (skipped, others processed)
- Mock `/v1/models` returning entries with non-string `id` (skipped, others processed)
- Mock `/v1/models` returning duplicate IDs (last wins)
- Auth loader injects Bearer token correctly
- Auth loader rejects non-API auth type
