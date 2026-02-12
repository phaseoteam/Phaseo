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
}
