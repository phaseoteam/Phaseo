import { File } from "expo-file-system";
import { CHARS_PER_TOKEN, estimatePrompt, estimateTokens, fitStart, shouldCompact, summaryMessages, summaryRequest, tailStart, TAIL_SHARE, TRANSCRIPT_SHARE } from "./compaction";
import { lastAnswerUsage, latestSummary, saveSummary, threadSize, threadTail, type ThreadMessage } from "./db";
import { audioFormat, type ContentPart, type WireMessage } from "./request";
import type { ChatAttachment, ChatSummary, TokenUsage } from "./types";

/**
 * The conversation one model sees for one request, read from SQLite rather than from the screen: every user
 * message and that model's finished answers, after its latest summary. When the request would fill 80% of the
 * model's context window, older messages are summarised first (compaction.ts).
 *
 * Attachments: like the website's chat, photos and audio go only with the message being answered; earlier
 * ones are named in the text instead of being encoded and sent again on every request. Text files stay.
 */
export type PreparedThread = {
  messages: WireMessage[];
  /** Set when this request wrote a new summary. */
  summary?: ChatSummary;
  /** What the summary request cost. */
  summaryUsage?: TokenUsage;
  /** Why the request isn't what was intended (a summary that couldn't be written). */
  notice?: string;
  estimate: number;
  contextTokens: number;
  compacted: boolean;
};

const textCache = new Map<string, string>();
let textCacheChars = 0;

async function textFile(attachment: ChatAttachment) {
  const cached = textCache.get(attachment.uri);
  if (cached != null) return cached;
  const file = new File(attachment.uri);
  const text = file.exists ? await file.text() : "";
  textCache.set(attachment.uri, text);
  textCacheChars += text.length;
  // Keep at most ~4 MB of text files in memory; oldest first.
  for (const [uri, value] of textCache) {
    if (textCacheChars <= 4_000_000) break;
    textCache.delete(uri);
    textCacheChars -= value.length;
  }
  return text;
}

const mediaNote = (attachment: ChatAttachment) => `[${attachment.kind === "image" ? "Image" : "Audio"} attached earlier: ${attachment.name}]`;

/** The text a summary sees for a message (attachments named, not included). */
export const entryText = (message: Pick<ThreadMessage, "content" | "attachments">) => [message.content, ...message.attachments.map((attachment) => (attachment.kind === "text" ? `[Text file: ${attachment.name}]` : mediaNote(attachment)))].filter(Boolean).join("\n\n");

async function userContent(message: ThreadMessage, latest: boolean): Promise<string | ContentPart[]> {
  if (!message.attachments.length) return message.content;
  const parts: ContentPart[] = [];
  const texts: string[] = [];
  for (const attachment of message.attachments) {
    if (attachment.kind === "text") {
      texts.push(`Attached file ${attachment.name}:\n\`\`\`\n${await textFile(attachment)}\n\`\`\``);
      continue;
    }
    if (!latest) { texts.push(mediaNote(attachment)); continue; }
    const file = new File(attachment.uri);
    if (!file.exists) continue;
    if (attachment.kind === "image") parts.push({ type: "image_url", image_url: { url: `data:${attachment.mimeType};base64,${await file.base64()}` } });
    else parts.push({ type: "input_audio", input_audio: { data: await file.base64(), format: audioFormat(attachment.mimeType, attachment.name) } });
  }
  const text = [message.content, ...texts].filter(Boolean).join("\n\n");
  return parts.length ? [{ type: "text", text }, ...parts] : text;
}

export async function toWire(messages: readonly ThreadMessage[], latestId: string): Promise<WireMessage[]> {
  const wire: WireMessage[] = [];
  for (const message of messages) {
    wire.push(message.role === "user" ? { role: "user", content: await userContent(message, message.id === latestId) } : { role: "assistant", content: message.content });
  }
  return wire;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "the request failed").replace(/\.$/, "");

export async function prepareThread(args: {
  chatId: string;
  model: string;
  modelLabel: string;
  /** The user message being answered. */
  upTo: { id: string; position: number; attachments: ChatAttachment[] };
  systemPrompt: string | null;
  contextTokens: number;
  signal: AbortSignal;
  onSummarising?(): void;
  /** Runs the summary request with the same model and proxy. */
  summarise(messages: WireMessage[]): Promise<{ text: string; usage?: TokenUsage }>;
}): Promise<PreparedThread> {
  const { chatId, model, upTo, contextTokens } = args;
  const summary = await latestSummary(chatId, model, upTo.position);
  const after = summary?.throughPosition ?? -1;
  const prefix = summary ? summaryMessages(summary.summary) : [];
  const media = upTo.attachments.filter((attachment) => attachment.kind !== "text").length;
  const last = await lastAnswerUsage(chatId, model, upTo.position);
  // The gateway's count of this model's previous request, when that request sent the whole thread since the
  // current summary: not one sent before that summary, and not one cut short because a summary failed (a notice).
  const usable = Boolean(last?.usage?.inputTokens && !last.notice && last.position > after && (!summary || last.createdAt > summary.createdAt || last.usage.summary));
  const size = await threadSize(chatId, model, after, upTo.position, usable ? last!.position : undefined);
  const calibrated = usable ? { promptTokens: last!.usage!.inputTokens!, charsSince: size.charsSince } : null;
  const estimate = estimatePrompt({ threadChars: size.chars, systemChars: args.systemPrompt?.length ?? 0, summaryChars: summary?.summary.length ?? 0, media, calibrated });
  const everything = async () => (await threadTail(chatId, model, after, upTo.position, Number.MAX_SAFE_INTEGER)).messages;

  if (!shouldCompact(estimate, contextTokens)) {
    return { messages: [...prefix, ...await toWire(await everything(), upTo.id)], estimate, contextTokens, compacted: false };
  }

  // Enough of the newest messages for the summary's transcript and the word-for-word tail; older ones were
  // already left out of desktop's transcript, so they aren't read at all.
  const loaded = await threadTail(chatId, model, after, upTo.position, Math.floor(contextTokens * (TRANSCRIPT_SHARE + TAIL_SHARE * CHARS_PER_TOKEN)));
  const entries = loaded.messages.map((message) => ({ role: message.role, content: entryText(message) }));
  const tail = tailStart(entries, contextTokens);
  const fallback = async (reason: string): Promise<PreparedThread> => {
    if (estimate <= contextTokens * 0.95) {
      return { messages: [...prefix, ...await toWire(await everything(), upTo.id)], notice: `Couldn't summarise earlier messages (${reason}), so the whole conversation was sent.`, estimate, contextTokens, compacted: false };
    }
    const room = Math.floor(contextTokens * 0.75) - estimateTokens((args.systemPrompt?.length ?? 0) + (summary?.summary.length ?? 0));
    const start = fitStart(entries, room);
    return { messages: [...prefix, ...await toWire(loaded.messages.slice(start), upTo.id)], notice: `Couldn't summarise earlier messages (${reason}), so only the newest messages that fit in ${args.modelLabel}'s context window were sent.`, estimate, contextTokens, compacted: false };
  };
  if (tail < 0) return fallback("there's only one long message");

  args.onSummarising?.();
  try {
    const latestRequest = entries.at(-1)?.content ?? null;
    const result = await args.summarise(summaryRequest({ head: entries.slice(0, tail), previousSummary: summary?.summary, skipped: loaded.skipped, latestRequest, contextTokens }));
    const text = result.text.trim();
    if (!text) throw new Error("the model returned an empty summary");
    const saved: ChatSummary = { chatId, model, throughPosition: loaded.messages[tail]!.position - 1, summary: text, usage: result.usage ?? null, createdAt: Date.now() };
    saveSummary(saved);
    return { messages: [...summaryMessages(text), ...await toWire(loaded.messages.slice(tail), upTo.id)], summary: saved, summaryUsage: result.usage, estimate, contextTokens, compacted: true };
  } catch (error) {
    if (args.signal.aborted) throw error;
    return fallback(errorText(error).replace(/^./, (first) => first.toLowerCase()));
  }
}
