import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { DevToolsWriter, type DevToolsEntry, type Stats } from "@ai-stats/devtools-core";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";

const app = new Hono();

// Configuration
const DEFAULT_DEVTOOLS_DIR = ".ai-stats-devtools";
const BASE_PORT = parseInt(process.env.PORT || "4983", 10);
const getArgValue = (flag: string) => {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
};
const portArg = getArgValue("--port");
const resolvedPort = portArg ? parseInt(portArg, 10) : BASE_PORT;
const dirArg = getArgValue("--dir");
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(SERVER_DIR, "../../public");

const resolveDevtoolsDir = () =>
  dirArg ||
  process.env.AI_STATS_DEVTOOLS_DIR ||
  DEFAULT_DEVTOOLS_DIR;
let devtoolsDir = resolveDevtoolsDir();
let writer = new DevToolsWriter(devtoolsDir);

/**
 * API Routes
 */

// Get all generations with optional filtering
app.get("/api/generations", (c) => {
  try {
    const entries = writer.readEntries();

    // Query parameters for filtering
    const type = c.req.query("type");
    const model = c.req.query("model");
    const hasError = c.req.query("hasError");
    const limit = parseInt(c.req.query("limit") || "100", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    let filtered = entries;

    if (type) {
      filtered = filtered.filter((e) => e.type === type);
    }

    if (model) {
      filtered = filtered.filter((e) => e.metadata.model === model);
    }

    if (hasError === "true") {
      filtered = filtered.filter((e) => e.error !== null);
    } else if (hasError === "false") {
      filtered = filtered.filter((e) => e.error === null);
    }

    // Sort by timestamp (most recent first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    // Pagination
    const paginated = filtered.slice(offset, offset + limit);

    return c.json({
      generations: paginated,
      total: filtered.length,
      offset,
      limit
    });
  } catch (error) {
    console.error("Error reading generations:", error);
    return c.json({ error: "Failed to read generations" }, 500);
  }
});

// Get a specific generation by ID
app.get("/api/generations/:id", (c) => {
  try {
    const id = c.req.param("id");
    const entries = writer.readEntries();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      return c.json({ error: "Generation not found" }, 404);
    }

    return c.json(entry);
  } catch (error) {
    console.error("Error reading generation:", error);
    return c.json({ error: "Failed to read generation" }, 500);
  }
});

// Get aggregate statistics
app.get("/api/stats", (c) => {
  try {
    const entries = writer.readEntries();

    const stats: Stats = {
      total_requests: entries.length,
      total_errors: entries.filter((e) => e.error !== null).length,
      total_cost: entries.reduce((sum, e) => sum + (e.metadata.cost?.total_cost || 0), 0),
      total_tokens: entries.reduce((sum, e) => sum + (e.metadata.usage?.total_tokens || 0), 0),
      total_duration_ms: entries.reduce((sum, e) => sum + e.duration_ms, 0),
      by_endpoint: {},
      by_model: {}
    };

    // Aggregate by endpoint type
    entries.forEach((entry) => {
      const type = entry.type;
      if (!stats.by_endpoint[type]) {
        stats.by_endpoint[type] = {
          count: 0,
          errors: 0,
          avg_duration_ms: 0,
          total_cost: 0
        };
      }

      stats.by_endpoint[type].count++;
      if (entry.error) stats.by_endpoint[type].errors++;
      stats.by_endpoint[type].total_cost += entry.metadata.cost?.total_cost || 0;
    });

    // Calculate average duration for each endpoint
    Object.keys(stats.by_endpoint).forEach((type) => {
      const typeEntries = entries.filter((e) => e.type === type);
      const totalDuration = typeEntries.reduce((sum, e) => sum + e.duration_ms, 0);
      stats.by_endpoint[type].avg_duration_ms = totalDuration / typeEntries.length;
    });

    // Aggregate by model
    entries.forEach((entry) => {
      const model = entry.metadata.model;
      if (!model) return;

      if (!stats.by_model[model]) {
        stats.by_model[model] = {
          count: 0,
          tokens: 0,
          cost: 0
        };
      }

      stats.by_model[model].count++;
      stats.by_model[model].tokens += entry.metadata.usage?.total_tokens || 0;
      stats.by_model[model].cost += entry.metadata.cost?.total_cost || 0;
    });

    return c.json(stats);
  } catch (error) {
    console.error("Error calculating stats:", error);
    return c.json({ error: "Failed to calculate stats" }, 500);
  }
});

// Get session metadata
app.get("/api/metadata", (c) => {
  try {
    const metadata = writer.readSessionMetadata();
    return c.json(metadata || {});
  } catch (error) {
    console.error("Error reading metadata:", error);
    return c.json({ error: "Failed to read metadata" }, 500);
  }
});

// Export data
app.get("/api/export", (c) => {
  const format = c.req.query("format") || "json";

  try {
    const entries = writer.readEntries();

    if (format === "json") {
      c.header("Content-Type", "application/json");
      c.header("Content-Disposition", 'attachment; filename="devtools-export.json"');
      return c.json(entries);
    }

    if (format === "jsonl") {
      const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
      c.header("Content-Type", "application/x-ndjson");
      c.header("Content-Disposition", 'attachment; filename="devtools-export.jsonl"');
      return c.text(jsonl);
    }

    return c.json({ error: "Unsupported format. Use 'json' or 'jsonl'" }, 400);
  } catch (error) {
    console.error("Error exporting data:", error);
    return c.json({ error: "Failed to export data" }, 500);
  }
});

// Serve binary assets (images, audio, video)
app.get("/devtools-assets/*", async (c) => {
  const assetPath = c.req.path.replace("/devtools-assets/", "");
  const fullPath = path.join(devtoolsDir, "assets", assetPath);

  if (!fs.existsSync(fullPath)) {
    return c.json({ error: "Asset not found" }, 404);
  }

  const buffer = fs.readFileSync(fullPath);
  const ext = path.extname(fullPath).toLowerCase();

  // Set appropriate content type
  const contentTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo"
  };

  c.header("Content-Type", contentTypes[ext] || "application/octet-stream");
  return c.body(buffer);
});

// Serve React frontend
app.use("/*", serveStatic({ root: PUBLIC_DIR }));

// Fallback to index.html for client-side routing
app.get("*", serveStatic({ path: path.join(PUBLIC_DIR, "index.html") }));

/**
 * Start server
 */
export function startServer(port: number = resolvedPort) {
  console.log(" █████╗ ██╗    ███████╗████████╗ █████╗ ████████╗███████╗    ██████╗ ███████╗██╗   ██╗████████╗ ██████╗  ██████╗ ██╗     ███████╗");
  console.log("██╔══██╗██║    ██╔════╝╚══██╔══╝██╔══██╗╚══██╔══╝██╔════╝    ██╔══██╗██╔════╝██║   ██║╚══██╔══╝██╔═══██╗██╔═══██╗██║     ██╔════╝");
  console.log("███████║██║    ███████╗   ██║   ███████║   ██║   ███████╗    ██║  ██║█████╗  ██║   ██║   ██║   ██║   ██║██║   ██║██║     ███████╗");
  console.log("██╔══██║██║    ╚════██║   ██║   ██╔══██║   ██║   ╚════██║    ██║  ██║██╔══╝  ╚██╗ ██╔╝   ██║   ██║   ██║██║   ██║██║     ╚════██║");
  console.log("██║  ██║██║    ███████║   ██║   ██║  ██║   ██║   ███████║    ██████╔╝███████╗ ╚████╔╝    ██║   ╚██████╔╝╚██████╔╝███████╗███████║");
  console.log("╚═╝  ╚═╝╚═╝    ╚══════╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ╚══════╝    ╚═════╝ ╚══════╝  ╚═══╝     ╚═╝    ╚═════╝  ╚═════╝ ╚══════╝╚══════╝");
  console.log("");
  devtoolsDir = resolveDevtoolsDir();
  writer = new DevToolsWriter(devtoolsDir);
  console.log("AI Stats Devtools Viewer starting...");
  console.log(`Watching directory: ${path.resolve(devtoolsDir)}`);
  console.log(`Server running at http://localhost:${port}`);
  console.log(`View Devtools at http://localhost:${port}`);
  console.log("Monitor requests, responses, costs, and usage in real time.");
  if (!fs.existsSync(path.join(PUBLIC_DIR, "index.html"))) {
    console.warn("UI build not found. Run `pnpm --filter @ai-stats/devtools-viewer build` or use `pnpm --filter @ai-stats/devtools-viewer dev` for the UI dev server.");
  }

  serve({
    fetch: app.fetch,
    port
  });
}

// Start server if this file is run directly
const moduleUrl = new URL(import.meta.url);
moduleUrl.search = "";
moduleUrl.hash = "";
const modulePath = fileURLToPath(moduleUrl);
const argvPaths = process.argv.map((arg) => path.resolve(arg));
const isDirectRun =
  argvPaths.includes(path.resolve(modulePath)) ||
  argvPaths.some(
    (arg) =>
      arg.endsWith(path.normalize("src/server/index.ts")) ||
      arg.endsWith(path.normalize("dist/server/index.js"))
  );

const shouldStart = isDirectRun || process.argv.includes("--start");

if (shouldStart) {
  startServer(resolvedPort);
}

export { app };


