# Getting Started with AI Stats Devtools

This guide walks you through setting up and using AI Stats Devtools to debug and monitor your AI application.

## Installation

### Option 1: Built into the SDK

The devtools function is already included in `@ai-stats/sdk`:

```bash
npm install @ai-stats/sdk
```

```typescript
import { AIStats, createAIStatsDevtools } from '@ai-stats/sdk';
```

### Option 2: Standalone Package

Install the devtools as a separate package:

```bash
npm install @ai-stats/sdk @ai-stats/devtools
```

```typescript
import { AIStats } from '@ai-stats/sdk';
import { createAIStatsDevtools } from '@ai-stats/devtools';
```

Both approaches work identically - choose whichever fits your project structure better.

## Quick Start (3 Steps)

### Step 1: Enable Devtools

Add one line to your AI Stats client initialization:

```typescript
import { AIStats, createAIStatsDevtools } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools()  // ← Add this line
});
```

That's it! All your API calls are now being captured.

### Step 2: Make API Calls

Use your AI Stats client normally:

```typescript
// Chat completion
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});

// Streaming
for await (const chunk of client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Count to 10' }],
  stream: true
})) {
  process.stdout.write(chunk);
}

// Embeddings
await client.generateEmbedding({
  model: 'text-embedding-3-small',
  input: ['Hello world']
});
```

All of these calls are automatically captured with:
- Full request and response data
- Timing information
- Token usage and costs
- Any errors that occur

### Step 3: View Your Data

Start the devtools viewer:

```bash
npx @ai-stats/devtools-viewer
```

Then open http://localhost:4983 in your browser to see:

- **Live Dashboard**: Real-time view of all API requests
- **Request Details**: Click any request to see full details
- **Filtering**: Filter by endpoint, model, provider, status
- **Cost Tracking**: See exact costs and token usage
- **Error Debugging**: Full error details with solutions
- **Export**: Download data as JSON

## What Gets Captured?

Every API call captures:

```typescript
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  type: "chat.completions",
  timestamp: 1704067200000,
  duration_ms: 1234,
  request: {
    model: "gpt-4",
    messages: [{ role: "user", content: "Hello!" }],
    temperature: 0.7
  },
  response: {
    choices: [{ message: { content: "Hi there!" } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 }
  },
  error: null,
  metadata: {
    sdk: "typescript",
    sdk_version: "0.2.1",
    stream: false,
    usage: { prompt_tokens: 10, completion_tokens: 5 },
    cost: { total_cost: 0.0015 },
    model: "gpt-4",
    provider: "openai"
  }
}
```

## Configuration Options

Customize the devtools behavior:

```typescript
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    // Where to store telemetry data
    directory: '.ai-stats-devtools',  // default

    // How often to flush data to disk (ms)
    flushIntervalMs: 1000,  // default: 1 second

    // Max entries before forcing flush
    maxQueueSize: 1000,  // default

    // Capture HTTP headers (useful for debugging)
    captureHeaders: false,  // default: false

    // Save binary assets (images, audio, video)
    saveAssets: true  // default: true
  })
});
```

## Environment Variables

Control devtools via environment variables:

```bash
# Enable/disable devtools
AI_STATS_DEVTOOLS=true

# Custom data directory
AI_STATS_DEVTOOLS_DIR=./my-devtools-data

# Then run your app
tsx app.ts
```

**Default behavior:**
- Enabled when `NODE_ENV !== 'production'`
- Disabled in production
- Can override with `AI_STATS_DEVTOOLS` env var

## Common Patterns

### Development Only

```typescript
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: process.env.NODE_ENV !== 'production'
    ? createAIStatsDevtools()
    : undefined
});
```

### Custom Directory Per Environment

```typescript
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    directory: `.devtools-${process.env.NODE_ENV}`
  })
});
```

### Debug Mode with Headers

```typescript
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    captureHeaders: process.env.DEBUG === 'true',
    flushIntervalMs: 500  // Faster flushing in debug mode
  })
});
```

## Viewing Data

### Start the Viewer

```bash
# Run from any directory
npx @ai-stats/devtools-viewer

# Or install globally
npm install -g @ai-stats/devtools-viewer
devtools-viewer

# Custom data directory
npx @ai-stats/devtools-viewer --dir ./my-devtools-data

# Custom port
npx @ai-stats/devtools-viewer --port 8080
```

### Viewer Features

- **Live Updates**: Auto-refreshes every 2 seconds
- **Smart Filtering**:
  - Filter by endpoint type
  - Filter by success/error status
  - Search by model, provider, or ID
  - Show only costly requests (>$0.01)
  - Show only slow requests (>5s)
- **Quick Actions**:
  - Copy generation ID
  - Copy full request/response JSON
  - Generate cURL command
  - Generate Python code
  - Generate TypeScript code
- **Keyboard Shortcuts**:
  - `?` - Show shortcuts
  - `/` - Focus search
  - `Escape` - Close modal / deselect
  - `⌘+C` - Copy generation ID
  - `⌘+D` - Toggle dark mode
- **Dark Mode**: Automatic system detection or manual toggle

## Performance Impact

Devtools is designed for zero impact on your application:

- **Async Capture**: All writes are non-blocking
- **Batched Writes**: Entries are queued and written in batches
- **< 5ms Overhead**: Negligible latency added per request
- **Safe Failures**: Write errors don't crash your app

## Data Storage

Telemetry data is stored locally in `.ai-stats-devtools/`:

```
.ai-stats-devtools/
├── session.json          # Session metadata
├── entries.jsonl         # All captured requests (JSONL format)
└── assets/               # Binary assets
    ├── images/
    ├── audio/
    └── video/
```

### JSONL Format

Each line is a complete JSON object:
```jsonl
{"id":"abc","type":"chat.completions","timestamp":1704067200000,...}
{"id":"def","type":"embeddings","timestamp":1704067201000,...}
```

This format is:
- Append-only (fast writes)
- Easy to parse line-by-line
- Compatible with streaming processing
- Human-readable (each line is valid JSON)

## Exporting Data

Export your telemetry data:

```bash
# From the viewer UI:
# Click the 💾 icon in the generations list

# Or programmatically:
import { DevToolsWriter, entriesToCSV } from '@ai-stats/devtools';

const writer = new DevToolsWriter('.ai-stats-devtools');
const entries = writer.readEntries();

// Export to CSV
const csv = entriesToCSV(entries);
fs.writeFileSync('telemetry.csv', csv);

// Or process as JSON
const json = JSON.stringify(entries, null, 2);
fs.writeFileSync('telemetry.json', json);
```

## Troubleshooting

### Devtools not capturing?

1. Check devtools is enabled:
   ```typescript
   devtools: createAIStatsDevtools()  // ✓
   devtools: undefined                 // ✗
   ```

2. Check environment variables:
   ```bash
   echo $AI_STATS_DEVTOOLS  # Should be 'true' or undefined (dev)
   echo $NODE_ENV           # Should NOT be 'production'
   ```

3. Check directory permissions:
   ```bash
   ls -la .ai-stats-devtools/
   # Should have entries.jsonl with recent timestamp
   ```

### Viewer showing "No Generations Yet"?

1. Make sure you've made at least one API call
2. Check the data directory matches:
   ```bash
   npx @ai-stats/devtools-viewer --dir .ai-stats-devtools
   ```
3. Verify entries.jsonl exists and has content:
   ```bash
   cat .ai-stats-devtools/entries.jsonl
   ```

### Performance issues?

1. Increase flush interval:
   ```typescript
   devtools: createAIStatsDevtools({
     flushIntervalMs: 5000  // Flush every 5s instead of 1s
   })
   ```

2. Reduce queue size:
   ```typescript
   devtools: createAIStatsDevtools({
     maxQueueSize: 100  // Flush more frequently
   })
   ```

3. Disable in production:
   ```typescript
   devtools: process.env.NODE_ENV === 'production'
     ? undefined
     : createAIStatsDevtools()
   ```

## Next Steps

- Check out the [examples directory](../../sdk/sdk-ts/examples/) for more usage patterns
- Read the [cross-language guide](./CROSS_LANGUAGE.md) for Python, Go, and other languages
- Explore the [API documentation](https://docs.ai-stats.org) for advanced features
- Join our [Discord](https://discord.gg/ai-stats) for support and discussion

## Comparison to Other Tools

| Feature | AI Stats Devtools | OpenRouter Devtools | LangSmith |
|---------|-------------------|---------------------|-----------|
| **Data Storage** | Local (your machine) | Local | Cloud |
| **Privacy** | 100% private | 100% private | Data sent to cloud |
| **Cost** | Free | Free | Paid plans |
| **Setup** | One line of code | One line of code | SDK + account setup |
| **Real-time UI** | ✓ | ✓ | ✓ |
| **Multi-language** | ✓ (TS, Py, Go, etc.) | ✗ (Node.js only) | ✓ |
| **Offline** | ✓ | ✓ | ✗ |

Inspired by OpenRouter's excellent devtools pattern, AI Stats Devtools brings the same developer experience to 400+ AI models across all major providers.
