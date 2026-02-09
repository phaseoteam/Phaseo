export type StudioMode = "chat" | "code";

export type ProviderKind = "mock" | "openai-compatible";

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
  provider: ProviderKind;
  openAiBaseUrl: string;
  openAiApiKey: string;
  openAiModel: string;
  commandSafetyPrompt: boolean;
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
  pickWorkspace: () => Promise<string | null>;
  listWorkspaceFiles: (workspacePath: string) => Promise<WorkspaceFile[]>;
  readWorkspaceFile: (workspacePath: string, relativePath: string) => Promise<string>;
  writeWorkspaceFile: (workspacePath: string, relativePath: string, content: string) => Promise<void>;
  runCommand: (request: CommandRunRequest) => Promise<CommandRun>;
  stopCommand: (runId: string) => Promise<void>;
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
