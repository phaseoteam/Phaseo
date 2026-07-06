# Changelog

## 0.2.1

All notable changes to `@phaseo/devtools` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1-alpha.0] - 2025-02-05

### Added

- Initial release of `@phaseo/devtools` package
- `createPhaseoDevtools()` function for SDK integration
- OpenRouter-inspired hook pattern for telemetry capture
- Standalone package installable as `@phaseo/devtools`
- Cross-language design for TypeScript, Python, Go, C#, Ruby, PHP, Rust
- Comprehensive documentation:
  - README with installation and usage
  - GETTING_STARTED guide with step-by-step instructions
  - CROSS_LANGUAGE guide showing patterns for all languages
- Built on `@phaseo/devtools-core` for data capture
- Compatible with `@phaseo/devtools-viewer` for visualization

### Features

- **Simple Integration**: Enable with one line: `devtools: createPhaseoDevtools()`
- **Flexible Configuration**: Customize directory, flush interval, headers, assets
- **Environment Control**: Use `PHASEO_DEVTOOLS` and `PHASEO_DEVTOOLS_DIR` env vars
- **Zero Performance Impact**: Async capture, < 5ms overhead per request
- **Local Storage**: All data stays on your machine (privacy-first)
- **Universal Viewer**: Use same viewer across all language implementations

### Documentation

- [README.md](./README.md) - Installation and basic usage
- [GETTING_STARTED.md](./GETTING_STARTED.md) - Comprehensive tutorial
- [CROSS_LANGUAGE.md](./CROSS_LANGUAGE.md) - Multi-language examples

### Breaking Changes

None - this is a new package. The old pattern (`devtools: { enabled: true }`) still works but the new `createPhaseoDevtools()` pattern is recommended.

### Migration from Old Pattern

**Before:**

```typescript
import { Phaseo } from "@phaseo/sdk";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: {
    enabled: true,
    directory: ".phaseo-devtools",
    flushIntervalMs: 1000,
  },
});
```

**After:**

```typescript
import { Phaseo, createPhaseoDevtools } from "@phaseo/sdk";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools({
    directory: ".phaseo-devtools",
    flushIntervalMs: 1000,
  }),
});
```

Or using the standalone package:

```typescript
import { Phaseo } from "@phaseo/sdk";
import { createPhaseoDevtools } from "@phaseo/devtools";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools(),
});
```

## [Unreleased]

### Planned

- Python implementation (`phaseo[devtools]`)
- Go implementation (`github.com/phaseo/phaseo-go/devtools`)
- C# implementation (`Phaseo.Devtools`)
- Ruby implementation (`phaseo-devtools`)
- PHP implementation (`phaseo/devtools`)
- Rust implementation (`phaseo-devtools`)

### Ideas

- VS Code extension for inline devtools viewing
- Real-time collaboration features
- Cloud sync option (opt-in)
- Advanced analytics and insights
- Cost optimization suggestions
- Token usage predictions
