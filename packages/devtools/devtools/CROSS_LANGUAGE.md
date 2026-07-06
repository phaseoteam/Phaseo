# Cross-Language Devtools Pattern

The `createPhaseoDevtools()` pattern is designed to work consistently across all Phaseo SDKs.

## TypeScript/JavaScript

```typescript
import { Phaseo, createPhaseoDevtools } from '@phaseo/sdk';

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools()
});
```

Or using the standalone package:

```typescript
import { Phaseo } from '@phaseo/sdk';
import { createPhaseoDevtools } from '@phaseo/devtools';

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools()
});
```

## Python

```python
from phaseo import Phaseo
from phaseo.devtools import create_phaseo_devtools

client = Phaseo(
    api_key=os.environ["PHASEO_API_KEY"],
    devtools=create_phaseo_devtools()
)
```

Or with custom configuration:

```python
from phaseo import Phaseo
from phaseo.devtools import create_phaseo_devtools

client = Phaseo(
    api_key=os.environ["PHASEO_API_KEY"],
    devtools=create_phaseo_devtools(
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
    "github.com/phaseo/phaseo-go"
    "github.com/phaseo/phaseo-go/devtools"
)

func main() {
    client := phaseo.NewClient(
        phaseo.WithAPIKey(os.Getenv("PHASEO_API_KEY")),
        phaseo.WithDevtools(devtools.CreatePhaseoDevtools()),
    )
}
```

With custom configuration:

```go
client := phaseo.NewClient(
    phaseo.WithAPIKey(os.Getenv("PHASEO_API_KEY")),
    phaseo.WithDevtools(devtools.CreatePhaseoDevtools(
        devtools.WithDirectory("./my-devtools-data"),
        devtools.WithFlushInterval(2 * time.Second),
        devtools.WithCaptureHeaders(true),
    )),
)
```

## C# / .NET

```csharp
using Phaseo;
using Phaseo.Devtools;

var client = new PhaseoClient(
    apiKey: Environment.GetEnvironmentVariable("PHASEO_API_KEY"),
    devtools: PhaseoDevtools.Create()
);
```

With custom configuration:

```csharp
var client = new PhaseoClient(
    apiKey: Environment.GetEnvironmentVariable("PHASEO_API_KEY"),
    devtools: PhaseoDevtools.Create(new DevtoolsConfig
    {
        Directory = "./my-devtools-data",
        FlushIntervalMs = 2000,
        CaptureHeaders = true
    })
);
```

## Ruby

```ruby
require 'phaseo'

client = Phaseo::Client.new(
  api_key: ENV['PHASEO_API_KEY'],
  devtools: Phaseo::Devtools.create
)
```

With custom configuration:

```ruby
client = Phaseo::Client.new(
  api_key: ENV['PHASEO_API_KEY'],
  devtools: Phaseo::Devtools.create(
    directory: './my-devtools-data',
    flush_interval_ms: 2000,
    capture_headers: true
  )
)
```

## PHP

```php
<?php

use Phaseo\Phaseo;
use Phaseo\Devtools;

$client = new Phaseo([
    'api_key' => $_ENV['PHASEO_API_KEY'],
    'devtools' => Devtools::create()
]);
```

With custom configuration:

```php
$client = new Phaseo([
    'api_key' => $_ENV['PHASEO_API_KEY'],
    'devtools' => Devtools::create([
        'directory' => './my-devtools-data',
        'flush_interval_ms' => 2000,
        'capture_headers' => true
    ])
]);
```

## Rust

```rust
use phaseo::{Phaseo, devtools};

let client = Phaseo::builder()
    .api_key(std::env::var("PHASEO_API_KEY").unwrap())
    .devtools(devtools::create())
    .build()?;
```

With custom configuration:

```rust
let client = Phaseo::builder()
    .api_key(std::env::var("PHASEO_API_KEY").unwrap())
    .devtools(devtools::create()
        .directory("./my-devtools-data")
        .flush_interval(Duration::from_secs(2))
        .capture_headers(true)
    )
    .build()?;
```

## Implementation Notes

All language implementations should:

1. **Write to the same format**: All SDKs write telemetry data to `.phaseo-devtools/` in the same JSONL format defined by `@phaseo/devtools-core`

2. **Share the same viewer**: All languages use `@phaseo/devtools-viewer` to view captured data (it's language-agnostic)

3. **Use consistent naming**:
   - Function: `createPhaseoDevtools()` / `create_phaseo_devtools()` / `CreatePhaseoDevtools()`
   - Config keys: `directory`, `flushIntervalMs`, `captureHeaders`, `saveAssets`, `maxQueueSize`

4. **Respect environment variables**:
   - `PHASEO_DEVTOOLS=true/false` - Enable/disable devtools
   - `PHASEO_DEVTOOLS_DIR=path` - Custom directory path
   - Default to enabled in dev, disabled in production

5. **Zero performance impact**: All implementations should:
   - Capture asynchronously (non-blocking)
   - Queue entries and batch write
   - Add < 5ms overhead per request
   - Gracefully handle write failures

## Current Status

| Language | Status | Package | Viewer Support |
|----------|--------|---------|----------------|
| TypeScript | Complete | `@phaseo/sdk`, `@phaseo/devtools` | Native |
| Python | Complete | `phaseo` | Compatible |
| Go | Complete | `github.com/phaseo/phaseo-go` | Compatible |
| C# | Complete | `Phaseo` | Compatible |
| Java | Complete | `phaseo-sdk` | Compatible |
| Ruby | Complete | `phaseo` | Compatible |
| PHP | Complete | `phaseo/phaseo-php` | Compatible |
| Rust | Coming Soon | `phaseo` | Compatible |

The devtools viewer (`@phaseo/devtools-viewer`) already supports viewing data from any language implementation.
