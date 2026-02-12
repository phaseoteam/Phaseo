import * as fs from "fs";
import * as path from "path";

export type EndpointType =
  | "chat.completions"
  | "messages"
  | "images.generations"
  | "images.edits"
  | "audio.speech"
  | "audio.transcriptions"
  | "audio.translations"
  | "video.generations"
  | "embeddings"
  | "moderations"
  | "responses"
  | "batches.create"
  | "batches.retrieve"
  | "files.list"
  | "files.retrieve"
  | "files.upload"
  | "models.list"
  | "providers"
  | "credits"
  | "activity"
  | "health"
  | "analytics"
  | "generations.retrieve"
  | "provisioning.keys.list"
  | "provisioning.keys.create"
  | "provisioning.keys.get"
  | "provisioning.keys.update"
  | "provisioning.keys.delete";

export type SdkIdentifier =
  | "typescript"
  | "python"
  | "go"
  | "csharp"
  | "ruby"
  | "php"
  | "java"
  | "rust"
  | "cpp";

export type ErrorInfo = {
  message: string;
  code?: string;
  status?: number;
  stack?: string;
};

export type UsageInfo = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  images_generated?: number;
  audio_seconds?: number;
  video_seconds?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

export type CostInfo = {
  input_cost?: number;
  output_cost?: number;
  cache_creation_cost?: number;
  cache_read_cost?: number;
  total_cost: number;
};

export type Metadata = {
  sdk: SdkIdentifier;
  sdk_version: string;
  stream: boolean;
  chunk_count?: number;
  usage?: UsageInfo;
  cost?: CostInfo;
  model?: string;
  provider?: string;
  status_code?: number;
  headers?: Record<string, string>;
};

export type DevToolsEntry = {
  id: string;
  type: EndpointType;
  timestamp: number;
  duration_ms: number;
  request: Record<string, any>;
  response: Record<string, any> | null;
  error: ErrorInfo | null;
  metadata: Metadata;
};

export type DevToolsConfig = {
  enabled: boolean;
  directory: string;
  flushIntervalMs: number;
  maxQueueSize: number;
  captureHeaders: boolean;
  saveAssets: boolean;
};

export type SessionMetadata = {
  session_id: string;
  started_at: number;
  sdk: SdkIdentifier;
  sdk_version: string;
  platform?: string;
  node_version?: string;
};

export type Stats = {
  total_requests: number;
  total_errors: number;
  total_cost: number;
  total_tokens: number;
  total_duration_ms: number;
  by_endpoint: Record<
    string,
    {
      count: number;
      errors: number;
      avg_duration_ms: number;
      total_cost: number;
    }
  >;
  by_model: Record<
    string,
    {
      count: number;
      tokens: number;
      cost: number;
    }
  >;
};

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

  writeEntry(entry: DevToolsEntry): void {
    this.ensureDirectory();
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(this.generationsFile, line, "utf-8");
  }

  writeEntries(entries: DevToolsEntry[]): void {
    if (entries.length === 0) return;
    this.ensureDirectory();
    const lines = entries.map((entry) => JSON.stringify(entry) + "\n").join("");
    fs.appendFileSync(this.generationsFile, lines, "utf-8");
  }

  writeSessionMetadata(metadata: SessionMetadata): void {
    this.ensureDirectory();
    fs.writeFileSync(this.metadataFile, JSON.stringify(metadata, null, 2), "utf-8");
  }

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

    const ext = this.detectExtension(type, buffer);
    const filename = `${id}.${ext}`;
    const filepath = path.join(this.assetsDir, type, filename);

    fs.writeFileSync(filepath, buffer);
    return path.relative(this.directory, filepath);
  }

  readEntries(): DevToolsEntry[] {
    if (!fs.existsSync(this.generationsFile)) {
      return [];
    }

    const content = fs.readFileSync(this.generationsFile, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    return lines.map((line) => JSON.parse(line) as DevToolsEntry);
  }

  readSessionMetadata(): SessionMetadata | null {
    if (!fs.existsSync(this.metadataFile)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(this.metadataFile, "utf-8"));
  }

  clear(): void {
    if (fs.existsSync(this.generationsFile)) {
      fs.unlinkSync(this.generationsFile);
    }
    if (fs.existsSync(this.metadataFile)) {
      fs.unlinkSync(this.metadataFile);
    }
  }

  getDirectory(): string {
    return this.directory;
  }

  private detectExtension(type: "images" | "audio" | "video", buffer: Buffer): string {
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
      return "png";
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
      return "mp3";
    }

    if (type === "video") {
      if (magic.toString("utf-8", 4, 8) === "ftyp") {
        return "mp4";
      }
      if (magic.toString("utf-8", 0, 4) === "RIFF" && magic.toString("utf-8", 8, 12) === "AVI ") {
        return "avi";
      }
      return "mp4";
    }

    return "bin";
  }
}

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

  return [headers.join(","), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))].join("\n");
}
