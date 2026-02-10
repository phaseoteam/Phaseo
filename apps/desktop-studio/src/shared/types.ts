export type StudioMode = "chat" | "code";

export type ProviderKind = "mock" | "openai-compatible";
export type ThemePreference = "system" | "light" | "dark";

export interface ProviderProfile {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
}

export interface ModeModelSelection {
  providerId: string;
  model: string;
}

export interface Session {
  id: string;
  title: string;
  mode: StudioMode;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: string;
  model?: string;
  status?: "done" | "streaming" | "error";
}

export interface WorkspaceFile {
  path: string;
  name: string;
  isDirectory: boolean;
}

export interface AppSettings {
  providers: ProviderProfile[];
  chatSelection: ModeModelSelection;
  codeSelection: ModeModelSelection;
  commandSafetyPrompt: boolean;
  theme: ThemePreference;
}

export interface CommandRun {
  id: string;
  command: string;
  workspacePath: string;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
}

export interface CommandOutputChunk {
  runId: string;
  stream: "stdout" | "stderr";
  chunk: string;
  at: string;
}

export interface ChatChunkEvent {
  sessionId: string;
  messageId: string;
  chunk: string;
}

export interface ChatDoneEvent {
  sessionId: string;
  messageId: string;
  status: "done" | "error";
  error?: string;
}

export interface GitStatusEntry {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  originalPath?: string;
}

export interface GitDiffRequest {
  workspacePath: string;
  relativePath?: string;
}

export interface GitPatchApplyResult {
  applied: boolean;
  output: string;
}

export interface BootstrapData {
  sessions: Session[];
  settings: AppSettings;
  activeSessionId: string | null;
  workspacePath: string | null;
}

export interface SendMessageInput {
  sessionId: string;
  content: string;
  mode: StudioMode;
}

export interface SendMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

export interface CommandRunRequest {
  workspacePath: string;
  command: string;
}

export interface DesktopApi {
  bootstrap: () => Promise<BootstrapData>;
  createSession: (mode: StudioMode) => Promise<Session>;
  setActiveSession: (sessionId: string) => Promise<void>;
  listMessages: (sessionId: string) => Promise<ChatMessage[]>;
  sendMessage: (input: SendMessageInput) => Promise<SendMessageResult>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  fetchProviderModels: (providerId: string) => Promise<string[]>;
  pickWorkspace: () => Promise<string | null>;
  listWorkspaceFiles: (workspacePath: string) => Promise<WorkspaceFile[]>;
  readWorkspaceFile: (workspacePath: string, relativePath: string) => Promise<string>;
  writeWorkspaceFile: (workspacePath: string, relativePath: string, content: string) => Promise<void>;
  runCommand: (request: CommandRunRequest) => Promise<CommandRun>;
  stopCommand: (runId: string) => Promise<void>;
  listGitStatus: (workspacePath: string) => Promise<GitStatusEntry[]>;
  getGitDiff: (request: GitDiffRequest) => Promise<string>;
  applyGitPatch: (workspacePath: string, patch: string) => Promise<GitPatchApplyResult>;
  onChatChunk: (listener: (event: ChatChunkEvent) => void) => () => void;
  onChatDone: (listener: (event: ChatDoneEvent) => void) => () => void;
  onCommandOutput: (listener: (event: CommandOutputChunk) => void) => () => void;
  onCommandDone: (listener: (event: CommandRun) => void) => () => void;
}

export interface StoreShape {
  sessions: Session[];
  messages: ChatMessage[];
  settings: AppSettings;
  activeSessionId: string | null;
  workspacePath: string | null;
}
