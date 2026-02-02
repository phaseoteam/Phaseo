# @ai-stats/devtools-viewer

Web-based viewer for AI Stats DevTools telemetry data.

## Overview

The DevTools Viewer provides a beautiful, real-time web interface for inspecting API requests captured by AI Stats SDKs. It features:

- **Live telemetry updates** - Auto-refreshes every 2 seconds
- **Adaptive UI** - Different views for chat, images, audio, video, etc.
- **Analytics dashboard** - Aggregate stats by endpoint, model, cost, tokens
- **Export functionality** - Export telemetry as JSON or JSONL

## Installation

```bash
npm install -g @ai-stats/devtools-viewer
# or
pnpm add -g @ai-stats/devtools-viewer
# or
npx @ai-stats/devtools-viewer start
```

## Usage

### Start the Viewer

```bash
# Start with defaults (port 4983, directory .ai-stats-devtools)
ai-stats-devtools start

# Custom port
ai-stats-devtools start -p 3000

# Custom directory
ai-stats-devtools start -d /path/to/devtools

# Both
ai-stats-devtools start -p 8080 -d ./my-devtools
```

Then open http://localhost:4983 in your browser.

### Environment Variables

```bash
# Set devtools directory
export AI_STATS_DEVTOOLS_DIR=/path/to/devtools

# Set port
export PORT=3000

# Start server
ai-stats-devtools start
```

## Features

### Generations View

- **Sidebar list** - All captured API requests sorted by timestamp
- **Adaptive detail view** - Specialized views for different endpoint types:
  - **Chat Completions** - Messages, tool calls, reasoning blocks
  - **Images** - Generated images, prompts, revised prompts
  - **Audio** - Audio player, transcriptions, translations
  - **Video** - Video player, generation parameters
  - **Generic** - JSON view for all other endpoints
- **Error highlighting** - Failed requests clearly marked
- **Metadata display** - Model, provider, duration, cost, tokens

### Stats Dashboard

- **Overview cards** - Total requests, cost, tokens, avg duration
- **By Endpoint table** - Breakdown by endpoint type
- **By Model table** - Breakdown by model
- **Error rate tracking** - Monitor API failures
- **Export buttons** - Download data as JSON or JSONL

### Real-time Updates

The viewer automatically polls for new telemetry every 2 seconds, so you see API requests appear in real-time as your application makes them.

## API Endpoints

The viewer exposes these HTTP endpoints:

- `GET /api/generations` - Get all generations (with filtering)
- `GET /api/generations/:id` - Get specific generation
- `GET /api/stats` - Get aggregate statistics
- `GET /api/metadata` - Get session metadata
- `GET /api/export?format=json|jsonl` - Export telemetry
- `GET /assets/*` - Serve binary assets (images, audio, video)

### Query Parameters for `/api/generations`

```bash
# Filter by endpoint type
/api/generations?type=chat.completions

# Filter by model
/api/generations?model=gpt-4

# Filter errors only
/api/generations?hasError=true

# Pagination
/api/generations?limit=50&offset=100
```

## Development

### Build

```bash
# Build server
pnpm run build:server

# Build UI
pnpm run build:ui

# Build both
pnpm run build
```

### Development Mode

```bash
# Run server in watch mode
pnpm run dev:server

# Run UI dev server
pnpm run dev:ui

# Run both concurrently
pnpm run dev
```

The UI dev server runs on port 3000 and proxies `/api` requests to the server on port 4983.

## Architecture

### Tech Stack

- **Server**: Hono (fast web framework)
- **UI**: React + TanStack Query
- **Styling**: Tailwind CSS
- **Build**: Vite (UI) + TypeScript (server)

### File Structure

```
packages/devtools-viewer/
├── src/
│   ├── server/           # Hono server
│   │   └── index.ts      # API routes, static serving
│   ├── ui/               # React frontend
│   │   ├── components/   # UI components
│   │   │   ├── endpoints/  # Endpoint-specific views
│   │   │   ├── GenerationsList.tsx
│   │   │   ├── GenerationDetail.tsx
│   │   │   └── StatsOverview.tsx
│   │   ├── App.tsx       # Main app
│   │   ├── main.tsx      # Entry point
│   │   └── index.css     # Tailwind styles
│   └── cli/              # CLI tool
│       └── index.ts      # Command-line interface
├── public/               # Built UI assets
└── dist/                 # Compiled server code
```

## Telemetry Format

The viewer reads JSONL (JSON Lines) files from the devtools directory:

```
.ai-stats-devtools/
├── generations.jsonl     # Main telemetry log
├── metadata.json         # Session info
└── assets/               # Binary assets
    ├── images/{uuid}.png
    ├── audio/{uuid}.mp3
    └── video/{uuid}.mp4
```

Each line in `generations.jsonl` is a JSON object with this structure:

```typescript
{
  id: string;
  type: "chat.completions" | "images.generations" | ...;
  timestamp: number;
  duration_ms: number;
  request: { ... };
  response: { ... } | null;
  error: { message: string } | null;
  metadata: {
    sdk: "typescript" | "python" | ...;
    sdk_version: string;
    stream: boolean;
    usage?: { ... };
    cost?: { ... };
    model?: string;
    provider?: string;
  };
}
```

## License

MIT
