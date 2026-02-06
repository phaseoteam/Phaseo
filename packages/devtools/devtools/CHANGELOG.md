# Changelog

All notable changes to `@ai-stats/devtools` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1-alpha.0] - 2025-02-05

### Added

- Initial release of `@ai-stats/devtools` package
- `createAIStatsDevtools()` function for SDK integration
- OpenRouter-inspired hook pattern for telemetry capture
- Standalone package installable as `@ai-stats/devtools`
- Cross-language design for TypeScript, Python, Go, C#, Ruby, PHP, Rust
- Comprehensive documentation:
  - README with installation and usage
  - GETTING_STARTED guide with step-by-step instructions
  - CROSS_LANGUAGE guide showing patterns for all languages
- Built on `@ai-stats/devtools-core` for data capture
- Compatible with `@ai-stats/devtools-viewer` for visualization

### Features

- **Simple Integration**: Enable with one line: `devtools: createAIStatsDevtools()`
- **Flexible Configuration**: Customize directory, flush interval, headers, assets
- **Environment Control**: Use `AI_STATS_DEVTOOLS` and `AI_STATS_DEVTOOLS_DIR` env vars
- **Zero Performance Impact**: Async capture, < 5ms overhead per request
- **Local Storage**: All data stays on your machine (privacy-first)
- **Universal Viewer**: Use same viewer across all language implementations

### Documentation

- [README.md](./README.md) - Installation and basic usage
- [GETTING_STARTED.md](./GETTING_STARTED.md) - Comprehensive tutorial
- [CROSS_LANGUAGE.md](./CROSS_LANGUAGE.md) - Multi-language examples

### Breaking Changes

None - this is a new package. The old pattern (`devtools: { enabled: true }`) still works but the new `createAIStatsDevtools()` pattern is recommended.

### Migration from Old Pattern

**Before:**
```typescript
import { AIStats } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: {
    enabled: true,
    directory: '.ai-stats-devtools',
    flushIntervalMs: 1000
  }
});
```

**After:**
```typescript
import { AIStats, createAIStatsDevtools } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    directory: '.ai-stats-devtools',
    flushIntervalMs: 1000
  })
});
```

Or using the standalone package:
```typescript
import { AIStats } from '@ai-stats/sdk';
import { createAIStatsDevtools } from '@ai-stats/devtools';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools()
});
```

## [Unreleased]

### Planned

- Python implementation (`ai-stats[devtools]`)
- Go implementation (`github.com/ai-stats/ai-stats-go/devtools`)
- C# implementation (`AIStats.Devtools`)
- Ruby implementation (`ai_stats-devtools`)
- PHP implementation (`ai-stats/devtools`)
- Rust implementation (`ai-stats-devtools`)

### Ideas

- VS Code extension for inline devtools viewing
- Real-time collaboration features
- Cloud sync option (opt-in)
- Advanced analytics and insights
- Cost optimization suggestions
- Token usage predictions
