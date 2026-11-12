import type { ModelSettings } from "./settings";

export type ChatAttachment = {
  id: string;
  kind: "image" | "text" | "audio";
  name: string;
  mimeType: string;
  /** File in the app's document directory. */
  uri: string;
  size?: number;
};

export type MessageStatus = "done" | "streaming" | "error" | "stopped";

export type ChatMessage = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  /** The model that wrote an assistant message. */
  model: string | null;
  /** For assistant messages, the user message they answer. */
  parentId: string | null;
  content: string;
  reasoning: string;
  status: MessageStatus;
  error: string | null;
  /** The gateway's or the stream's error code, and the HTTP status when there was one. */
  errorCode: string | null;
  errorStatus: number | null;
  attachments: ChatAttachment[];
  usage: MessageUsage | null;
  /** Something the reader should know about how this answer was asked for (a summary that couldn't be written). */
  notice: string | null;
  createdAt: number;
  position: number;
};

export type TokenUsage = { inputTokens?: number; outputTokens?: number; costUsd?: number };

/** An answer's usage; `summary` is the extra request that summarised older messages before it, when there was one. */
export type MessageUsage = TokenUsage & { summary?: TokenUsage };

/**
 * Older messages condensed for one model, once the chat outgrew its context window. Requests for that model
 * send the summary instead of every message up to `throughPosition`.
 */
export type ChatSummary = {
  chatId: string;
  model: string;
  throughPosition: number;
  summary: string;
  usage: TokenUsage | null;
  createdAt: number;
};

export type Chat = {
  id: string;
  title: string;
  /** One model, or several answering side by side. */
  models: string[];
  /** Each model's own settings in this chat. Models without an entry use the defaults. */
  modelSettings: Record<string, ModelSettings>;
  pinned: boolean;
  workspaceId: string | null;
  createdAt: number;
  updatedAt: number;
  preview: string;
};
