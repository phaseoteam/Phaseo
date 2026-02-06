# @ai-stats/devtools

Devtools for AI Stats SDK - enables telemetry capture and debugging for your AI applications.

## Installation

The devtools functionality is included in `@ai-stats/sdk` by default:

```bash
npm install @ai-stats/sdk
```

During installation, you'll be prompted to optionally install the devtools viewer:

```
🎯 AI Stats SDK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The SDK includes built-in telemetry capture for debugging.
Would you like to install the devtools viewer to visualize
your API requests in a beautiful web UI?

? Install devtools viewer? (Y/n)
```

### Manual Installation

You can also install the viewer manually at any time:

```bash
npm install -D @ai-stats/devtools-viewer
# or
npx @ai-stats/devtools-viewer
```

Or install the standalone devtools package:

```bash
npm install @ai-stats/devtools
# or
pnpm add @ai-stats/devtools
# or
yarn add @ai-stats/devtools
```

## Usage

### Basic Setup

```typescript
import { AIStats } from '@ai-stats/sdk';
import { createAIStatsDevtools } from '@ai-stats/devtools';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools()
});

// Now all your API calls will be captured automatically
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Custom Configuration

```typescript
import { AIStats } from '@ai-stats/sdk';
import { createAIStatsDevtools } from '@ai-stats/devtools';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    // Custom directory for devtools data
    directory: './my-devtools-data',

    // Flush to disk every 2 seconds
    flushIntervalMs: 2000,

    // Capture HTTP headers for debugging
    captureHeaders: true,

    // Don't save binary assets (images, audio, etc.)
    saveAssets: false
  })
});
```

### Environment Variable Control

You can control devtools via environment variables:

```bash
# Enable devtools explicitly
AI_STATS_DEVTOOLS=true

# Set custom directory
AI_STATS_DEVTOOLS_DIR=./custom-dir

# Then in your code:
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools()
});
```

By default, devtools is enabled in development (`NODE_ENV !== 'production'`) and disabled in production.

## Viewing Captured Data

To view the captured telemetry data, use the devtools viewer:

```bash
npx @ai-stats/devtools-viewer
```

This will start a local web server where you can:
- Inspect all API requests and responses
- View token usage and costs
- Debug errors with detailed error messages
- Filter by endpoint, model, provider, and more
- Export data as JSON or CSV

## What Gets Captured?

The devtools automatically captures:

- **Request Details**: Full request payload including messages, parameters, and configuration
- **Response Details**: Complete API responses
- **Timing**: Duration of each request in milliseconds
- **Usage**: Token counts (prompt, completion, cache hits)
- **Cost**: Calculated costs for each request
- **Errors**: Full error details including stack traces
- **Metadata**: Model, provider, streaming status, and more

All data is stored **locally on your machine** and never sent to external servers.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `directory` | string | `.ai-stats-devtools` | Directory to store captured data |
| `flushIntervalMs` | number | `1000` | How often to flush data to disk (ms) |
| `maxQueueSize` | number | `1000` | Max entries before forcing flush |
| `captureHeaders` | boolean | `false` | Whether to capture HTTP headers |
| `saveAssets` | boolean | `true` | Whether to save binary assets |

## Multi-Language Support

The devtools pattern works across all AI Stats SDKs:

### TypeScript/JavaScript
```typescript
import { AIStats } from '@ai-stats/sdk';
import { createAIStatsDevtools } from '@ai-stats/devtools';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools()
});
```

### Python
```python
from ai_stats import AIStats
from ai_stats.devtools import create_ai_stats_devtools

client = AIStats(
    api_key=os.environ["AI_STATS_API_KEY"],
    devtools=create_ai_stats_devtools()
)
```

### Go
```go
import (
    "github.com/ai-stats/ai-stats-go"
    "github.com/ai-stats/ai-stats-go/devtools"
)

client := aistats.NewClient(
    aistats.WithAPIKey(os.Getenv("AI_STATS_API_KEY")),
    aistats.WithDevtools(devtools.CreateAIStatsDevtools()),
)
```

*Note: Python, Go, and other language implementations coming soon.*

## License

MIT

## Links

- [Documentation](https://docs.ai-stats.org)
- [GitHub Repository](https://github.com/AI-Stats/AI-Stats)
- [AI Stats Dashboard](https://ai-stats.org)
