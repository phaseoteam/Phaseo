# AI Stats Devtools Architecture

This document explains the complete devtools architecture and how it works across the codebase.

## Overview

AI Stats Devtools provides a comprehensive debugging and monitoring solution for AI applications. It consists of three main components:

1. **@ai-stats/devtools-core** - Core telemetry capture and storage
2. **@ai-stats/devtools-viewer** - Web-based visualization UI
3. **@ai-stats/devtools** - Hook pattern for SDK integration

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     User Application                        │
│                                                             │
│  import { AIStats } from '@ai-stats/sdk';                   │
│  import { createAIStatsDevtools } from '@ai-stats/devtools';│
│                                                             │
│  const client = new AIStats({                               │
│    devtools: createAIStatsDevtools()                        │
│  });                                                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     @ai-stats/sdk                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              TelemetryCapture                        │  │
│  │  • Wraps all API calls                               │  │
│  │  • Captures request/response                         │  │
│  │  • Queues entries                                    │  │
│  │  • Async batch writes                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                @ai-stats/devtools-core                      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              DevToolsWriter                          │  │
│  │  • Writes to .ai-stats-devtools/                     │  │
│  │  • JSONL format (append-only)                        │  │
│  │  • Session metadata                                  │  │
│  │  • Binary asset storage                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Schemas (Zod)                           │  │
│  │  • DevToolsEntry                                     │  │
│  │  • DevToolsConfig                                    │  │
│  │  • SessionMetadata                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
                     File System
                 .ai-stats-devtools/
                 ├── session.json
                 ├── entries.jsonl
                 └── assets/

                            │
                            ▼ (reads from)
┌─────────────────────────────────────────────────────────────┐
│               @ai-stats/devtools-viewer                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Node.js Server (Express)                     │  │
│  │  • Reads entries.jsonl                               │  │
│  │  • Serves REST API                                   │  │
│  │  • Aggregates statistics                             │  │
│  │  • File watching (live updates)                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         React UI (Vite)                              │  │
│  │  • Generations list with filters                     │  │
│  │  • Detail view for each request                      │  │
│  │  • Real-time dashboard                               │  │
│  │  • Dark mode, keyboard shortcuts                     │  │
│  │  • Export functionality                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  Runs at: http://localhost:4983                            │
└─────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. @ai-stats/devtools-core

**Purpose**: Core telemetry capture and storage engine

**Key Files**:
- `src/schema.ts` - Zod schemas for all data types
- `src/writer.ts` - DevToolsWriter class for file I/O
- `src/index.ts` - Public API exports

**Features**:
- Type-safe schemas using Zod
- JSONL format for efficient append operations
- Binary asset storage (images, audio, video)
- Session metadata tracking
- CSV export functionality

**Data Flow**:
```typescript
DevToolsEntry → DevToolsWriter → .ai-stats-devtools/entries.jsonl
```

### 2. @ai-stats/devtools-viewer

**Purpose**: Web-based visualization and debugging UI

**Key Files**:
- `src/server/index.ts` - Express server serving telemetry data
- `src/ui/App.tsx` - Main React application
- `src/ui/components/GenerationsList.tsx` - Sidebar with filtering
- `src/ui/components/GenerationDetail.tsx` - Detailed view
- `src/cli/index.ts` - CLI entry point

**Features**:
- Live updates (polls every 2 seconds)
- Smart filtering (endpoint, model, provider, status)
- Quick actions (copy JSON, cURL, Python, TypeScript)
- Dark mode with system preference detection
- Keyboard shortcuts
- Error debugging with actionable solutions
- Cost and token usage visualization

**Data Flow**:
```
File System → Express API → React UI (polling)
```

### 3. @ai-stats/devtools

**Purpose**: Hook pattern for SDK integration (NEW)

**Key Files**:
- `src/index.ts` - createAIStatsDevtools() function
- `README.md` - Installation and usage guide
- `GETTING_STARTED.md` - Step-by-step tutorial
- `CROSS_LANGUAGE.md` - Multi-language examples

**Features**:
- Simple one-line integration
- OpenRouter-inspired API pattern
- Configurable options
- Environment variable support
- Cross-language design

**Usage Pattern**:
```typescript
import { AIStats, createAIStatsDevtools } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    directory: '.ai-stats-devtools',
    flushIntervalMs: 1000,
    captureHeaders: false,
    saveAssets: true
  })
});
```

### 4. SDK Integration (@ai-stats/sdk)

**Purpose**: TypeScript SDK with built-in telemetry

**Key Files**:
- `src/index.ts` - AIStats client class
- `src/devtools/telemetry.ts` - TelemetryCapture class
- `src/devtools/index.ts` - Devtools exports

**Features**:
- Automatic capture of all API calls
- Non-blocking async writes
- Streaming request support
- Error capture with stack traces
- Usage and cost tracking
- Minimal overhead (< 5ms per request)

**Integration Flow**:
```typescript
AIStats constructor → TelemetryCapture → DevToolsWriter
```

## Data Format

### DevToolsEntry (JSONL)

Each line in `entries.jsonl` is a complete JSON object:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "chat.completions",
  "timestamp": 1704067200000,
  "duration_ms": 1234,
  "request": {
    "model": "gpt-4",
    "messages": [{ "role": "user", "content": "Hello!" }]
  },
  "response": {
    "choices": [{ "message": { "content": "Hi!" } }],
    "usage": { "prompt_tokens": 10, "completion_tokens": 5 }
  },
  "error": null,
  "metadata": {
    "sdk": "typescript",
    "sdk_version": "0.2.1",
    "stream": false,
    "usage": { "prompt_tokens": 10, "completion_tokens": 5 },
    "cost": { "total_cost": 0.0015 },
    "model": "gpt-4",
    "provider": "openai"
  }
}
```

### Session Metadata

`session.json`:
```json
{
  "session_id": "abc-123",
  "started_at": 1704067200000,
  "sdk": "typescript",
  "sdk_version": "0.2.1",
  "platform": "darwin",
  "node_version": "v20.0.0"
}
```

## Performance Characteristics

### Write Performance

- **Queue-based**: Entries queued in memory
- **Batch writes**: Flush every 1 second (configurable)
- **Non-blocking**: All I/O is async
- **Overhead**: < 5ms per request
- **Memory**: ~1KB per queued entry

### Read Performance

- **Streaming**: JSONL allows line-by-line streaming
- **Indexed**: No full file parse required
- **Efficient**: Only read what's needed
- **Scalable**: Works with 10k+ entries

### Storage

- **Format**: JSONL (newline-delimited JSON)
- **Size**: ~2-5KB per entry (varies by payload)
- **Growth**: Linear with request count
- **Cleanup**: Manual (no auto-deletion)

## Cross-Language Design

The architecture is designed for multi-language support:

### Shared Components

1. **Data Format**: All languages write to same JSONL format
2. **Viewer**: Single viewer works for all languages
3. **Schemas**: Zod schemas define canonical format

### Language-Specific

1. **SDK Integration**: Each SDK implements TelemetryCapture
2. **File I/O**: Native file operations per language
3. **Hook Pattern**: Language-appropriate API design

### Implementation Status

| Language | Status | Package |
|----------|--------|---------|
| TypeScript | ✅ Complete | `@ai-stats/sdk`, `@ai-stats/devtools` |
| Python | 🚧 Planned | `ai-stats[devtools]` |
| Go | 🚧 Planned | `github.com/ai-stats/ai-stats-go/devtools` |
| C# | 🚧 Planned | `AIStats.Devtools` |
| Ruby | 🚧 Planned | `ai_stats-devtools` |
| PHP | 🚧 Planned | `ai-stats/devtools` |
| Rust | 🚧 Planned | `ai-stats-devtools` |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_STATS_DEVTOOLS` | `NODE_ENV !== 'production'` | Enable/disable devtools |
| `AI_STATS_DEVTOOLS_DIR` | `.ai-stats-devtools` | Data directory path |
| `NODE_ENV` | - | Auto-disable in production |

## Security & Privacy

### Data Storage

- **Local Only**: All data stays on your machine
- **No Cloud**: Never sent to external servers
- **No Analytics**: No tracking or telemetry
- **User Control**: You own and control all data

### Sensitive Data

- **Headers**: Disabled by default (can enable)
- **API Keys**: Redacted in request logs
- **PII**: Your responsibility to filter
- **Binary Assets**: Stored locally, can disable

## Comparison to Alternatives

### vs LangSmith

| Feature | AI Stats Devtools | LangSmith |
|---------|-------------------|-----------|
| Data Location | Local | Cloud |
| Privacy | 100% private | Depends on plan |
| Cost | Free | Paid plans |
| Setup | One line | SDK + account |
| Offline | ✓ | ✗ |

### vs OpenRouter Devtools

| Feature | AI Stats | OpenRouter |
|---------|----------|------------|
| Models | 400+ | 200+ |
| Languages | TS, Py, Go, etc. | Node.js only |
| Pattern | Same concept | Inspired by this |
| Providers | 50+ | OpenRouter only |

## Future Enhancements

### Short Term

1. Python SDK implementation
2. Go SDK implementation
3. VS Code extension
4. Enhanced analytics

### Long Term

1. Real-time collaboration
2. Cloud sync (opt-in)
3. Advanced cost optimization
4. Token usage predictions
5. Model performance comparisons

## Contributing

To add devtools to a new language SDK:

1. Implement `TelemetryCapture` equivalent
2. Write to `.ai-stats-devtools/entries.jsonl`
3. Follow the DevToolsEntry schema
4. Add `createAIStatsDevtools()` helper
5. Respect environment variables
6. Test with existing viewer

See [CROSS_LANGUAGE.md](./devtools/CROSS_LANGUAGE.md) for examples.

## References

- [OpenRouter Devtools](https://openrouter.ai/docs/developer-tools) - Inspiration
- [Zod](https://zod.dev/) - Schema validation
- [JSONL](https://jsonlines.org/) - File format
- [React Query](https://tanstack.com/query) - Data fetching
