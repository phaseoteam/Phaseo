import * as fs from "fs";
import * as path from "path";
import type { DevToolsEntry, SessionMetadata } from "./schema.js";

/**
 * Utility class for writing telemetry data to JSONL files
 */
export class DevToolsWriter {
  private readonly directory: string;
  private readonly generationsFile: string;
  private readonly metadataFile: string;
  private readonly assetsDir: string;

  constructor(directory: string = ".ai-stats-devtools") {
    this.directory = directory;
    this.generationsFile = path.join(directory, "generations.jsonl");
    this.metadataFile = path.join(directory, "metadata.json");
    this.assetsDir = path.join(directory, "assets");
  }

  /**
   * Initialize the devtools directory structure
   */
  ensureDirectory(): void {
    if (!fs.existsSync(this.directory)) {
      fs.mkdirSync(this.directory, { recursive: true });
    }
    if (!fs.existsSync(this.assetsDir)) {
      fs.mkdirSync(path.join(this.assetsDir, "images"), { recursive: true });
      fs.mkdirSync(path.join(this.assetsDir, "audio"), { recursive: true });
      fs.mkdirSync(path.join(this.assetsDir, "video"), { recursive: true });
    }
  }

  /**
   * Write a telemetry entry to generations.jsonl
   * Uses append mode to support concurrent writes
   */
  writeEntry(entry: DevToolsEntry): void {
    this.ensureDirectory();
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(this.generationsFile, line, "utf-8");
  }

  /**
   * Write multiple entries at once (batch flush)
   */
  writeEntries(entries: DevToolsEntry[]): void {
    if (entries.length === 0) return;
    this.ensureDirectory();
    const lines = entries.map((entry) => JSON.stringify(entry) + "\n").join("");
    fs.appendFileSync(this.generationsFile, lines, "utf-8");
  }

  /**
   * Write session metadata
   */
  writeSessionMetadata(metadata: SessionMetadata): void {
    this.ensureDirectory();
    fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2), "utf-8");
  }

  /**
   * Save a binary asset (image, audio, video)
   */
  async saveAsset(type: "images" | "audio" | "video", id: string, data: Blob | Buffer | ArrayBuffer): Promise<string> {
    this.ensureDirectory();

    let buffer: Buffer;
    if (data instanceof Blob) {
      buffer = Buffer.from(await data.arrayBuffer());
    } else if (data instanceof ArrayBuffer) {
      buffer = Buffer.from(data);
    } else {
      buffer = data;
    }

    // Determine extension based on type and content
    const ext = this.detectExtension(type, buffer);
    const filename = `${id}.${ext}`;
    const filepath = path.join(this.assetsDir, type, filename);

    fs.writeFileSync(filepath, buffer);
    return path.relative(this.directory, filepath);
  }

  /**
   * Read all telemetry entries from generations.jsonl
   */
  readEntries(): DevToolsEntry[] {
    if (!fs.existsSync(this.generationsFile)) {
      return [];
    }

    const content = fs.readFileSync(this.generationsFile, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    return lines.map((line) => JSON.parse(line) as DevToolsEntry);
  }

  /**
   * Read session metadata
   */
  readSessionMetadata(): SessionMetadata | null {
    if (!fs.existsSync(this.metadataFile)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(this.metadataFile, "utf-8"));
  }

  /**
   * Clear all telemetry data (useful for testing)
   */
  clear(): void {
    if (fs.existsSync(this.generationsFile)) {
      fs.unlinkSync(this.generationsFile);
    }
    if (fs.existsSync(this.metadataFile)) {
      fs.unlinkSync(this.metadataFile);
    }
  }

  /**
   * Get directory path
   */
  getDirectory(): string {
    return this.directory;
  }

  /**
   * Detect file extension from buffer content
   */
  private detectExtension(type: "images" | "audio" | "video", buffer: Buffer): string {
    // Check magic bytes
    const magic = buffer.slice(0, 12);

    if (type === "images") {
      if (magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4E && magic[3] === 0x47) {
        return "png";
      }
      if (magic[0] === 0xFF && magic[1] === 0xD8 && magic[2] === 0xFF) {
        return "jpg";
      }
      if (magic[0] === 0x47 && magic[1] === 0x49 && magic[2] === 0x46) {
        return "gif";
      }
      if (magic.toString("utf-8", 0, 4) === "RIFF" && magic.toString("utf-8", 8, 12) === "WEBP") {
        return "webp";
      }
      return "png"; // default
    }

    if (type === "audio") {
      if (magic.toString("utf-8", 0, 4) === "RIFF") {
        return "wav";
      }
      if (magic[0] === 0xFF && (magic[1] & 0xE0) === 0xE0) {
        return "mp3";
      }
      if (magic.toString("utf-8", 4, 8) === "ftyp") {
        return "m4a";
      }
      return "mp3"; // default
    }

    if (type === "video") {
      if (magic.toString("utf-8", 4, 8) === "ftyp") {
        return "mp4";
      }
      if (magic.toString("utf-8", 0, 4) === "RIFF" && magic.toString("utf-8", 8, 12) === "AVI ") {
        return "avi";
      }
      return "mp4"; // default
    }

    return "bin";
  }
}

/**
 * Helper to format entries for export
 */
export function entriesToCSV(entries: DevToolsEntry[]): string {
  const headers = [
    "id",
    "type",
    "timestamp",
    "duration_ms",
    "model",
    "provider",
    "stream",
    "total_tokens",
    "total_cost",
    "error"
  ];

  const rows = entries.map((entry) => [
    entry.id,
    entry.type,
    new Date(entry.timestamp).toISOString(),
    entry.duration_ms,
    entry.metadata.model || "",
    entry.metadata.provider || "",
    entry.metadata.stream,
    entry.metadata.usage?.total_tokens || 0,
    entry.metadata.cost?.total_cost || 0,
    entry.error ? entry.error.message : ""
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
  ].join("\n");
}
