/**
 * Compaction for chats longer than a model's context window, ported from the desktop app's Phaseo turn
 * engine (apps/desktop src/main/phaseoTurn.ts): near 80% of the window, everything before a recent tail
 * is summarised by the same model, and requests send the summary instead of those messages.
 *
 * Each model in a chat has its own thread (every user message and only its own answers) and its own
 * window, so budgets and summaries are per model. These functions are pure; thread.ts does the reading,
 * the request and the saving.
 */

/** Compaction starts when a request is estimated to fill this share of the model's context window. */
export const COMPACT_AT = 0.8;
/** The window when the catalogue doesn't know one, as desktop assumes. */
export const FALLBACK_CONTEXT_TOKENS = 128_000;
/** Desktop's estimate. Most text is nearer 4 characters a token, so this leaves headroom. */
export const CHARS_PER_TOKEN = 3.5;
/** A rough allowance for each image or audio clip sent with the newest message. */
export const MEDIA_TOKENS = 1_500;
/** The newest messages kept word for word: about a quarter of the window. */
export const TAIL_SHARE = 0.25;
/** The transcript a summary request may carry, in characters per token of the window (desktop's 1.4). */
export const TRANSCRIPT_SHARE = 1.4;
export const SUMMARY_MAX_TOKENS = 6_000;

export const estimateTokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

/**
 * A model's context window, from the catalogue's per-provider lengths. The smallest is used, because on
 * Auto the gateway may route to any of them; without any, desktop's 128k fallback.
 */
export function contextTokensFrom(lengths: readonly (number | null | undefined)[] | null | undefined) {
  const known = (lengths ?? []).filter((value): value is number => typeof value === "number" && value > 0);
  return known.length ? Math.min(...known) : FALLBACK_CONTEXT_TOKENS;
}

/**
 * The next request's size in tokens. With the gateway's count for this model's previous request
 * (`usage.prompt_tokens`), only what was added since is estimated; otherwise everything is. A count far below
 * the character estimate means the thread changed since that request, so it never goes under half of it.
 */
export function estimatePrompt(args: { threadChars: number; systemChars: number; summaryChars: number; media: number; calibrated?: { promptTokens: number; charsSince: number } | null }) {
  const media = args.media * MEDIA_TOKENS;
  const estimated = estimateTokens(args.threadChars + args.systemChars + args.summaryChars);
  if (args.calibrated && args.calibrated.promptTokens > 0) return Math.max(args.calibrated.promptTokens + estimateTokens(args.calibrated.charsSince), Math.ceil(estimated * CALIBRATION_FLOOR)) + media;
  return estimated + media;
}

/** The least share of the character estimate a calibrated estimate may be. */
export const CALIBRATION_FLOOR = 0.5;

export const shouldCompact = (estimate: number, contextTokens: number) => estimate > contextTokens * COMPACT_AT;

type Entry = { role: "user" | "assistant"; content: string };

/**
 * Where the word-for-word tail starts: about a quarter of the window from the end, at a user message so
 * turns stay whole. The newest user message is always in the tail. -1 when there's nothing before it.
 */
export function tailStart(messages: readonly Entry[], contextTokens: number) {
  let tail = messages.length;
  let kept = 0;
  while (tail > 1 && kept + estimateTokens(messages[tail - 1]!.content.length) < contextTokens * TAIL_SHARE) kept += estimateTokens(messages[--tail]!.content.length);
  while (tail < messages.length && messages[tail]!.role !== "user") tail += 1;
  if (tail >= messages.length) {
    tail = messages.length - 1;
    while (tail > 0 && messages[tail]!.role !== "user") tail -= 1;
  }
  return tail > 0 ? tail : -1;
}

/**
 * Where to start so the newest messages fit in `tokens`, at a user message; used when a summary couldn't be
 * written and the whole thread won't fit. Always keeps the newest user message.
 */
export function fitStart(messages: readonly Entry[], tokens: number) {
  let start = messages.length;
  let used = 0;
  while (start > 0 && used + estimateTokens(messages[start - 1]!.content.length) <= tokens) used += estimateTokens(messages[--start]!.content.length);
  while (start < messages.length && messages[start]!.role !== "user") start += 1;
  if (start >= messages.length) {
    start = messages.length - 1;
    while (start > 0 && messages[start]!.role !== "user") start -= 1;
  }
  return Math.max(0, start);
}

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}\n… (${(text.length - limit).toLocaleString("en-GB")} more characters)` : text);

/**
 * The conversation as text for the summary request, within `budgetChars`: the previous summary first (it
 * already condenses everything before it), then the oldest messages are left out first.
 */
export function transcriptText(messages: readonly Entry[], budgetChars: number, previousSummary?: string | null, skipped = 0) {
  const lines = messages.map((message) => (message.role === "user" ? `User:\n${clip(message.content, 8000)}` : `Assistant:\n${message.content}`));
  const head = previousSummary ? `Summary of the conversation before this point:\n${previousSummary}` : "";
  let total = head.length + lines.reduce((sum, line) => sum + line.length + 2, 0);
  let from = 0;
  while (total > budgetChars && from < lines.length - 1) total -= lines[from++]!.length + 2;
  const left = skipped + from;
  return [head, left ? `[${left.toLocaleString("en-GB")} earlier messages left out]` : "", ...lines.slice(from)].filter(Boolean).join("\n\n");
}

export const SUMMARY_INSTRUCTIONS = "You are compacting a conversation between a person and an AI assistant so it can continue with less context. Write a summary another instance of the assistant can rely on. Include: the person's goals and every explicit instruction or preference; facts, names, numbers, code and decisions that later messages may depend on; questions already answered and what was concluded; anything still open; and exactly where the conversation left off. Be specific and complete but concise. Plain Markdown, no preamble.";

/** The summary request's messages: desktop's instructions adapted to chat, the transcript, and the latest request. */
export function summaryRequest(args: { head: readonly Entry[]; previousSummary?: string | null; skipped?: number; latestRequest?: string | null; contextTokens: number }) {
  const transcript = transcriptText(args.head, Math.floor(args.contextTokens * TRANSCRIPT_SHARE), args.previousSummary, args.skipped);
  const latest = args.latestRequest?.trim() ? `\n\nThe person's latest request was:\n${clip(args.latestRequest.trim(), 8000)}` : "";
  return [
    { role: "system" as const, content: SUMMARY_INSTRUCTIONS },
    { role: "user" as const, content: `${transcript}${latest}\n\nWrite the summary now.` },
  ];
}

/** What a request sends in place of the summarised messages, before the word-for-word tail. */
export function summaryMessages(summary: string) {
  return [
    { role: "user" as const, content: `<conversation_summary>\n${summary}\n</conversation_summary>\n\nEarlier messages were summarised above to save context. Continue from where the conversation left off.` },
    { role: "assistant" as const, content: "Understood. I'll continue from the summary." },
  ];
}
