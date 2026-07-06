# @phaseo/devtools

Devtools for Phaseo SDK - enables telemetry capture and debugging for your AI applications.

## Installation

The devtools functionality is included in `@phaseo/sdk` by default:

```bash
npm install @phaseo/sdk
```

During installation, you'll be prompted to optionally install the devtools viewer:

```
🎯 Phaseo SDK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The SDK includes built-in telemetry capture for debugging.
Would you like to install the devtools viewer to visualize
your API requests in a beautiful web UI?

? Install devtools viewer? (Y/n)
```

### Manual Installation

You can also install the viewer manually at any time:

```bash
npm install -D @phaseo/devtools-viewer
# or
npx @phaseo/devtools-viewer
```

Or install the standalone devtools package:

```bash
npm install @phaseo/devtools
# or
pnpm add @phaseo/devtools
# or
yarn add @phaseo/devtools
```

## Usage

### Basic Setup

```typescript
import { Phaseo } from '@phaseo/sdk';
import { createPhaseoDevtools } from '@phaseo/devtools';

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools()
});

// Now all your API calls will be captured automatically
const response = await client.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Custom Configuration

```typescript
import { Phaseo } from '@phaseo/sdk';
import { createPhaseoDevtools } from '@phaseo/devtools';

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools({
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
PHASEO_DEVTOOLS=true

# Set custom directory
PHASEO_DEVTOOLS_DIR=./custom-dir

# Then in your code:
const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools()
});
```

By default, devtools is enabled in development (`NODE_ENV !== 'production'`) and disabled in production.

## Viewing Captured Data

To view the captured telemetry data, use the devtools viewer:

```bash
npx @phaseo/devtools-viewer
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
| `directory` | string | `.phaseo-devtools` | Directory to store captured data |
| `flushIntervalMs` | number | `1000` | How often to flush data to disk (ms) |
| `maxQueueSize` | number | `1000` | Max entries before forcing flush |
| `captureHeaders` | boolean | `false` | Whether to capture HTTP headers |
| `saveAssets` | boolean | `true` | Whether to save binary assets |

## Multi-Language Support

The devtools pattern works across all Phaseo SDKs:

### TypeScript/JavaScript
```typescript
import { Phaseo } from '@phaseo/sdk';
import { createPhaseoDevtools } from '@phaseo/devtools';

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools()
});
```

### Python
```python
from phaseo import Phaseo
from phaseo.devtools import create_phaseo_devtools

client = Phaseo(
    api_key=os.environ["PHASEO_API_KEY"],
    devtools=create_phaseo_devtools()
)
```

### Go
```go
import (
    "github.com/phaseo/phaseo-go"
    "github.com/phaseo/phaseo-go/devtools"
)

client := phaseo.NewClient(
    phaseo.WithAPIKey(os.Getenv("PHASEO_API_KEY")),
    phaseo.WithDevtools(devtools.CreatePhaseoDevtools()),
)
```

*Note: Python, Go, and other language implementations coming soon.*

## License

MIT

## Links

- [Documentation](https://docs.phaseo.ai/v1)
- [GitHub Repository](https://github.com/phaseoteam/Phaseo)
- [Phaseo Dashboard](https://phaseo.ai)
