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
npm install @ai-stats/sdk
# or
pnpm add @ai-stats/sdk
```

The DevTools CLI ships with the TypeScript SDK. You can also install it separately:

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

# If installed locally (recommended)
pnpm exec ai-stats-devtools start
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
# Run both server and UI with hot reloading
pnpm run dev
```

This will:
1. Start the API server on port 4984 with auto-restart on changes
2. Start the Vite dev server on port 4983 with HMR (Hot Module Replacement)
3. Proxy all `/api` requests from the UI to the server

**How it works:**
- UI changes reload instantly in the browser (React Fast Refresh)
- Server changes trigger an automatic restart
- No need to rebuild or manually refresh

**Accessing the dev environment:**
- Open http://localhost:4983 in your browser
- Check the console for any errors
- Server logs appear in the terminal

**Troubleshooting:**
- If port 4984 is busy, the server won't start. Kill the process or change the port.
- If port 4983 is busy, the UI dev server won't start. Same solution.
- If you see `ENOENT` errors, make sure `.ai-stats-devtools` directory exists with sample data
- Check browser DevTools console (F12) for client-side errors
- Check terminal output for server-side errors

## Architecture

### Tech Stack

- **Server**: Hono (fast web framework)
- **UI**: React + TanStack Query
- **Styling**: Tailwind CSS
- **Build**: Vite (UI) + TypeScript (server)

### File Structure

```
packages/devtools/devtools-viewer/
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

## Troubleshooting

### Blank Screen When Clicking on Generations

If the screen goes blank when you click on a generation:

1. **Open Browser DevTools** (F12) and check the Console tab for errors
2. **Check the Network tab** to see if the API call to `/api/generations/{id}` is failing
3. **Look for component errors** - the ErrorBoundary will now show detailed error messages
4. **Check data format** - ensure your generations.jsonl has valid JSON on each line
5. **Try the "Try Again" button** that appears after errors

Recent fixes:
- Added comprehensive error boundaries with stack traces
- Improved null checking in all view components
- Added debug logging to identify rendering issues

### Dev Server Issues

**Port conflicts:**
```bash
# Find and kill processes on ports 4983/4984
# On Windows:
netstat -ano | findstr :4983
taskkill /PID <pid> /F

# On Linux/Mac:
lsof -ti:4983 | xargs kill -9
```

**Missing dependencies:**
```bash
cd packages/devtools/devtools-viewer
pnpm install
```

**Stale build artifacts:**
```bash
pnpm run clean
pnpm run build
```

### No Data Showing

1. **Check devtools directory exists:**
   ```bash
   ls -la .ai-stats-devtools/
   ```

2. **Verify files are present:**
   - `generations.jsonl` should exist and have content
   - `metadata.json` should exist

3. **Test with sample data:**
   ```bash
   # Create test entry
   echo '{"id":"test-1","type":"chat.completions","timestamp":1234567890,"duration_ms":100,"request":{"messages":[{"role":"user","content":"test"}]},"response":null,"error":null,"metadata":{"sdk":"test"}}' >> .ai-stats-devtools/generations.jsonl
   ```

## Quick Development Workflow

```bash
# 1. Navigate to devtools viewer
cd packages/devtools/devtools-viewer

# 2. Install dependencies (if needed)
pnpm install

# 3. Start dev servers
pnpm run dev

# 4. Open browser
# Navigate to http://localhost:4983

# 5. Make changes to components
# - Edit files in src/ui/components/
# - Changes reflect immediately (Hot Module Replacement)
# - No need to rebuild or refresh

# 6. Check for errors
# - Browser console (F12 → Console)
# - Terminal output (server logs)

# 7. Test with real data
# - Run your app with AI Stats SDK
# - Watch requests appear in real-time
```

## License

MIT
