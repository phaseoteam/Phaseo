# @ai-stats/devtools-core

Core types, schemas, and utilities for AI Stats DevTools.

## Overview

This package provides the shared TypeScript types and Zod schemas used across all AI Stats DevTools packages. It ensures consistent telemetry data format across all SDK languages (TypeScript, Python, Go, C#, Ruby, PHP, Java, Rust, C++).

## Installation

```bash
npm install @ai-stats/devtools-core
# or
pnpm add @ai-stats/devtools-core
# or
yarn add @ai-stats/devtools-core
```

## Usage

### Import Types

```typescript
import type {
  DevToolsEntry,
  DevToolsConfig,
  EndpointType,
  SdkIdentifier,
  ErrorInfo,
  UsageInfo,
  CostInfo,
  Metadata,
  SessionMetadata,
  Stats
} from "@ai-stats/devtools-core";
```

### Use Schemas for Validation

```typescript
import { DevToolsEntrySchema, DevToolsConfigSchema } from "@ai-stats/devtools-core";

// Validate an entry
const entry = DevToolsEntrySchema.parse({
  id: "uuid",
  type: "chat.completions",
  timestamp: Date.now(),
  duration_ms: 1500,
  request: { model: "gpt-4", messages: [] },
  response: { choices: [] },
  error: null,
  metadata: {
    sdk: "typescript",
    sdk_version: "0.2.1",
    stream: false
  }
});
```

### Write Telemetry Data

```typescript
import { DevToolsWriter } from "@ai-stats/devtools-core";

const writer = new DevToolsWriter(".ai-stats-devtools");

// Write a single entry
writer.writeEntry(entry);

// Write multiple entries (batch)
writer.writeEntries([entry1, entry2, entry3]);

// Save binary assets
await writer.saveAsset("images", "uuid", imageBlob);

// Read all entries
const entries = writer.readEntries();
```

### Export to CSV

```typescript
import { entriesToCSV } from "@ai-stats/devtools-core";

const entries = writer.readEntries();
const csv = entriesToCSV(entries);
fs.writeFileSync("export.csv", csv);
```

## Telemetry Schema

### DevToolsEntry

The main telemetry entry structure:

```typescript
{
  id: string;                          // UUID
  type: EndpointType;                  // 'chat.completions', 'images.generations', etc.
  timestamp: number;                   // Unix ms
  duration_ms: number;
  request: Record<string, any>;        // Original request payload
  response: Record<string, any> | null; // Response data (null on error)
  error: ErrorInfo | null;
  metadata: {
    sdk: 'typescript' | 'python' | ...;
    sdk_version: string;
    stream: boolean;
    chunk_count?: number;              // For streaming
    usage?: UsageInfo;                 // Tokens, images, audio seconds
    cost?: CostInfo;                   // USD breakdown
    model?: string;
    provider?: string;
  };
}
```

### Supported Endpoint Types

- `chat.completions` - Chat completions
- `images.generations` - Image generation
- `images.edits` - Image editing
- `audio.speech` - Text-to-speech
- `audio.transcriptions` - Speech-to-text
- `audio.translations` - Audio translation
- `video.generations` - Video generation
- `embeddings` - Text embeddings
- `moderations` - Content moderation
- `responses` - Anthropic-style responses
- `batches.create` - Create batch job
- `batches.retrieve` - Retrieve batch status
- `files.list` - List files
- `files.retrieve` - Get file
- `files.upload` - Upload file
- `models.list` - List models
- `health` - Health check
- `analytics` - Analytics
- `generations.retrieve` - Retrieve generation by ID

## File Structure

DevTools creates the following directory structure:

```
.ai-stats-devtools/
├── generations.jsonl          # Main telemetry log (JSONL format)
├── metadata.json              # Session metadata
└── assets/                    # Binary assets
    ├── images/{uuid}.png
    ├── audio/{uuid}.mp3
    └── video/{uuid}.mp4
```

## License

MIT
