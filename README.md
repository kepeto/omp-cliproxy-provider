# omp-cliproxy-provider

CLIProxyAPI provider extension for [OMP](https://github.com/oh-my-pi/omp) and [pi.dev](https://pi.dev) with automatic model discovery and [models.dev](https://models.dev) enrichment.

Single package, dual runtime: detects the host at load time (`@oh-my-pi/pi-coding-agent` on OMP, `@earendil-works/pi-coding-agent` on pi.dev) via a small shim (`src/host.ts`). Port of [`pi-cliproxyapi-provider`](https://github.com/0xRichardH/pi-cliproxyapi-provider), with fixes for OAuth login handling and model-name preservation for routed/free-tier models.

## Features

- **Auto model discovery** — fetches available models from your CLIProxyAPI instance at startup and on demand.
- **models.dev enrichment** — enriches discovered models with metadata from models.dev (capabilities, context window, pricing, modalities).
- **Smart matching** — resolves provider-specific model aliases and custom prefixes/suffixes (e.g. `nous-portal-free/tencent/hy3:free` → `tencent/hy3`).
- **OAuth-safe auth** — stores CLIProxyAPI API keys directly in `auth.json`; no `/login cpa` OAuth flow required.
- **Boot discovery** — refreshes models immediately on startup so slow providers don't block session creation.
- **Interactive commands** — `/cliproxyapi config`, `/cliproxyapi login`, `/cliproxyapi status`, `/cliproxyapi refresh`, `/cliproxyapi aliases`.

## Requirements

- OMP `>= 17.0.0` or pi.dev (any recent version)
- CLIProxyAPI-compatible backend URL and API key (if auth is required)

## Installation

```bash
omp install "git+https://github.com/kepeto/omp-cliproxy-provider.git"
```

To update an existing install:

```bash
omp install "git+https://github.com/kepeto/omp-cliproxy-provider.git" --force
```

Verify installation:

```bash
omp plugin list
```

Look for `omp-cliproxy-provider` with status `enabled: true`.

After installing or updating, **restart OMP** to load the new plugin.

## Configuration

### Global config

Path: `~/.omp/agent/pi-cliproxyapi-provider/config.json`

```json
{
  "providerName": "cpa",
  "baseUrl": "http://localhost:8317/v1",
  "authRequired": true,
  "authHeader": true,
  "modelsDevEnabled": true,
  "modelAliases": {},
  "gpt56ContextWindow": "canonical"
}
```

### Project config

Path: `<cwd>/.omp/pi-cliproxyapi-provider/config.json`

Project config supports `modelAliases` only; other settings are global-only.

### Environment variables

- `CLIPROXYAPI_API_KEY` — API key for CLIProxyAPI discovery and requests.
- `PI_CONFIG_DIR` — override project config directory name (default: `.omp`).
- `CPA_AUTH_PATH` — override path to auth.json for API key storage.

## Usage

### Setup

```bash
/cliproxyapi config connection
```

Follow the prompts to set provider name and base URL.

### Login

```bash
/cliproxyapi login
```

Enter your CLIProxyAPI base URL and API key. The key is persisted to `auth.json` and used for discovery and requests.

**Do not use `/login cpa`** — OMP only supports OAuth logins there and will warn about a missing callback. Use `/cliproxyapi login` instead.

### Status

```bash
/cliproxyapi status
```

Shows provider configuration, model counts, enrichment stats, and metadata age.

### Refresh

```bash
/cliproxyapi refresh
/cliproxyapi refresh models
/cliproxyapi refresh metadata
```

Refresh CPA models and/or models.dev metadata.

### Aliases

```bash
/cliproxyapi aliases
```

Shows unmatched CPA model IDs so you can add explicit aliases.

## Model matching

The provider enriches discovered models using models.dev metadata. Matching order:

1. **Alias** — explicit user-configured alias.
2. **Exact** — exact model ID match.
3. **Owner-prefix** — matches by canonical owner prefix (e.g. `openai/gpt-5.5`).
4. **Segment-suffix** — matches models.dev IDs as suffix of CPA model segments (handles custom prefixes like `nous-portal-free/tencent/hy3:free`).
5. **Normalized suffix** — case/punctuation-insensitive match.

## Troubleshooting

### Warning: No OAuth login is waiting for a manual callback

This happens when using `/login cpa` with CLIProxyAPI. Use `/cliproxyapi login` instead to store your API key directly.

### Models not enriching

Run `/cliproxyapi aliases` to see unmatched model IDs. Add explicit aliases in your config:

```json
{
  "modelAliases": {
    "custom-model-name": "provider/canonical-model-name"
  }
}
```

### Context window too small for GPT-5.6

Set `"gpt56ContextWindow": "full"` in global config to use the models.dev limit instead of the canonical 272,000 token window.

## License

MIT
