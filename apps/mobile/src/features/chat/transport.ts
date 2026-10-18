import { fetch as streamingFetch } from "expo/fetch";
import { File } from "expo-file-system";
import { authHeaders, buildUrl, workspaceCookie } from "@/lib/api/http";
import { audioFormat, buildRequestBody, loggableRequest, type ContentPart, type WireMessage } from "./request";
import type { ModelSettings, RequestCapabilities } from "./settings";
import { readChatCompletion, StreamError, type StreamHandlers, type StreamUsage } from "./stream";
import type { ChatMessage } from "./types";

export class ChatRequestError extends Error {
  constructor(message: string, public code: string, public status: number) {
    super(message);
  }
}

async function userContent(message: ChatMessage): Promise<string | ContentPart[]> {
  if (!message.attachments.length) return message.content;
  const parts: ContentPart[] = [];
  const texts: string[] = [];
  for (const attachment of message.attachments) {
    const file = new File(attachment.uri);
    if (!file.exists) continue;
    if (attachment.kind === "image") parts.push({ type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${await file.base64()}` } });
    else if (attachment.kind === "audio") parts.push({ type: "input_audio", input_audio: { data: await file.base64(), format: audioFormat(attachment.mimeType, attachment.name) } });
    else texts.push(`Attached file ${attachment.name}:\n\`\`\`\n${await file.text()}\n\`\`\``);
  }
  const text = [message.content, ...texts].filter(Boolean).join("\n\n");
  return [{ type: "text", text }, ...parts];
}

/**
 * The conversation one model sees. In a multi-model chat each model keeps its own
 * thread: every user message, plus only that model's finished answers.
 */
export async function historyFor(messages: ChatMessage[], model: string, upTo: string): Promise<WireMessage[]> {
  const wire: WireMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") wire.push({ role: "user", content: await userContent(message) });
    else if (message.model === model && message.content && message.status !== "error") wire.push({ role: "assistant", content: message.content });
    if (message.id === upTo) break;
  }
  return wire;
}

export type CompletionResult = { text: string; reasoning: string; usage?: StreamUsage };

/**
 * Streams an answer through phaseo.app's chat proxy, which bills the user's
 * workspace with the same managed key as web chat. The proxy picks the workspace
 * from the `activeWorkspaceId` cookie (checked against the user's memberships).
 */
export async function streamCompletion(args: { model: string; messages: WireMessage[]; settings?: ModelSettings; capabilities?: RequestCapabilities; workspaceId: string | null; signal: AbortSignal } & StreamHandlers): Promise<CompletionResult> {
  const headers: Record<string, string> = { ...(await authHeaders()), ...workspaceCookie(args.workspaceId), "content-type": "application/json", accept: "text/event-stream" };
  const requestBody = buildRequestBody(args);
  // Opt-in (EXPO_PUBLIC_CHAT_DEBUG=1 at build time) proof of what was sent; the bearer token is in the headers, never logged.
  if (process.env.EXPO_PUBLIC_CHAT_DEBUG === "1") console.info(`[phaseo-chat] POST /api/chat/chat-completions ${JSON.stringify({ workspaceId: args.workspaceId ? "<workspace>" : null, requestBody: loggableRequest(requestBody) })}`);
  const response = await streamingFetch(buildUrl("/api/chat/chat-completions"), {
    method: "POST",
    headers,
    signal: args.signal,
    body: JSON.stringify({ workspaceId: args.workspaceId, requestBody }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
    const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : null;
    const code = String(body.code ?? nested?.code ?? (typeof body.error === "string" ? body.error : "") ?? "");
    const message = String(body.message ?? nested?.message ?? (response.status === 402 ? "Your workspace is out of credit." : "The model couldn't answer."));
    throw new ChatRequestError(message, code || `http_${response.status}`, response.status);
  }
  if (!response.body) throw new StreamError("No answer stream came back.", "no_stream", true);
  return readChatCompletion(response.body as ReadableStream<Uint8Array>, args);
}
