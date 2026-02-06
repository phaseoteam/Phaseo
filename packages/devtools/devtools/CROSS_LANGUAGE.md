# Cross-Language Devtools Pattern

The `createAIStatsDevtools()` pattern is designed to work consistently across all AI Stats SDKs.

## TypeScript/JavaScript

```typescript
import { AIStats, createAIStatsDevtools } from '@ai-stats/sdk';

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools()
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

## Python

```python
from ai_stats import AIStats
from ai_stats.devtools import create_ai_stats_devtools

client = AIStats(
    api_key=os.environ["AI_STATS_API_KEY"],
    devtools=create_ai_stats_devtools()
)
```

Or with custom configuration:

```python
from ai_stats import AIStats
from ai_stats.devtools import create_ai_stats_devtools

client = AIStats(
    api_key=os.environ["AI_STATS_API_KEY"],
    devtools=create_ai_stats_devtools(
        directory="./my-devtools-data",
        flush_interval_ms=2000,
        capture_headers=True
    )
)
```

## Go

```go
package main

import (
    "os"
    "github.com/ai-stats/ai-stats-go"
    "github.com/ai-stats/ai-stats-go/devtools"
)

func main() {
    client := aistats.NewClient(
        aistats.WithAPIKey(os.Getenv("AI_STATS_API_KEY")),
        aistats.WithDevtools(devtools.CreateAIStatsDevtools()),
    )
}
```

With custom configuration:

```go
client := aistats.NewClient(
    aistats.WithAPIKey(os.Getenv("AI_STATS_API_KEY")),
    aistats.WithDevtools(devtools.CreateAIStatsDevtools(
        devtools.WithDirectory("./my-devtools-data"),
        devtools.WithFlushInterval(2 * time.Second),
        devtools.WithCaptureHeaders(true),
    )),
)
```

## C# / .NET

```csharp
using AIStats;
using AIStats.Devtools;

var client = new AIStatsClient(
    apiKey: Environment.GetEnvironmentVariable("AI_STATS_API_KEY"),
    devtools: AIStatsDevtools.Create()
);
```

With custom configuration:

```csharp
var client = new AIStatsClient(
    apiKey: Environment.GetEnvironmentVariable("AI_STATS_API_KEY"),
    devtools: AIStatsDevtools.Create(new DevtoolsConfig
    {
        Directory = "./my-devtools-data",
        FlushIntervalMs = 2000,
        CaptureHeaders = true
    })
);
```

## Ruby

```ruby
require 'ai_stats'

client = AIStats::Client.new(
  api_key: ENV['AI_STATS_API_KEY'],
  devtools: AIStats::Devtools.create
)
```

With custom configuration:

```ruby
client = AIStats::Client.new(
  api_key: ENV['AI_STATS_API_KEY'],
  devtools: AIStats::Devtools.create(
    directory: './my-devtools-data',
    flush_interval_ms: 2000,
    capture_headers: true
  )
)
```

## PHP

```php
<?php

use AIStats\AIStats;
use AIStats\Devtools;

$client = new AIStats([
    'api_key' => $_ENV['AI_STATS_API_KEY'],
    'devtools' => Devtools::create()
]);
```

With custom configuration:

```php
$client = new AIStats([
    'api_key' => $_ENV['AI_STATS_API_KEY'],
    'devtools' => Devtools::create([
        'directory' => './my-devtools-data',
        'flush_interval_ms' => 2000,
        'capture_headers' => true
    ])
]);
```

## Rust

```rust
use ai_stats::{AIStats, devtools};

let client = AIStats::builder()
    .api_key(std::env::var("AI_STATS_API_KEY").unwrap())
    .devtools(devtools::create())
    .build()?;
```

With custom configuration:

```rust
let client = AIStats::builder()
    .api_key(std::env::var("AI_STATS_API_KEY").unwrap())
    .devtools(devtools::create()
        .directory("./my-devtools-data")
        .flush_interval(Duration::from_secs(2))
        .capture_headers(true)
    )
    .build()?;
```

## Implementation Notes

All language implementations should:

1. **Write to the same format**: All SDKs write telemetry data to `.ai-stats-devtools/` in the same JSONL format defined by `@ai-stats/devtools-core`

2. **Share the same viewer**: All languages use `@ai-stats/devtools-viewer` to view captured data (it's language-agnostic)

3. **Use consistent naming**:
   - Function: `createAIStatsDevtools()` / `create_ai_stats_devtools()` / `CreateAIStatsDevtools()`
   - Config keys: `directory`, `flushIntervalMs`, `captureHeaders`, `saveAssets`, `maxQueueSize`

4. **Respect environment variables**:
   - `AI_STATS_DEVTOOLS=true/false` - Enable/disable devtools
   - `AI_STATS_DEVTOOLS_DIR=path` - Custom directory path
   - Default to enabled in dev, disabled in production

5. **Zero performance impact**: All implementations should:
   - Capture asynchronously (non-blocking)
   - Queue entries and batch write
   - Add < 5ms overhead per request
   - Gracefully handle write failures

## Current Status

| Language | Status | Package | Viewer Support |
|----------|--------|---------|----------------|
| TypeScript | ✅ Complete | `@ai-stats/sdk`, `@ai-stats/devtools` | ✅ Native |
| Python | 🚧 Coming Soon | `ai-stats` | ✅ Compatible |
| Go | 🚧 Coming Soon | `github.com/ai-stats/ai-stats-go` | ✅ Compatible |
| C# | 🚧 Coming Soon | `AIStats` | ✅ Compatible |
| Ruby | 🚧 Coming Soon | `ai_stats` | ✅ Compatible |
| PHP | 🚧 Coming Soon | `ai-stats/ai-stats-php` | ✅ Compatible |
| Rust | 🚧 Coming Soon | `ai-stats` | ✅ Compatible |

The devtools viewer (`@ai-stats/devtools-viewer`) already supports viewing data from any language implementation.
