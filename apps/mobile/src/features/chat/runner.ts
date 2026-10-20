import * as Crypto from "expo-crypto";
import { ApiError } from "@/lib/api/http";
import { endTimer, startTimer } from "@/lib/diagnostics";
import { perf } from "@/perf";
import { SUMMARY_MAX_TOKENS } from "./compaction";
import { appendDeltas, copyMessages, createChat, deleteMessagesFrom, finishMessage, getChat, getMessage, indexAnswer, insertMessage, nextPosition, updateChat, type MessagePatch, type StreamDelta } from "./db";
import { setLive, type LiveAnswer } from "./live";
import { streamingBoundaries } from "./markdownChunks";
import { contextTokensFor, modelLabelFor, requestCapabilities } from "./models";
import type { WireMessage } from "./request";
import { systemPromptFor, type ModelSettings } from "./settings";
import { notifyChat, setRunning } from "./state";
import { StreamError } from "./stream";
import { prepareThread, type PreparedThread } from "./thread";
import { ChatRequestError, streamCompletion } from "./transport";
import type { ChatAttachment, ChatMessage, MessageUsage, TokenUsage } from "./types";
import { chatReloaded, messageAdded, messageChanged, summaryAdded } from "./window";

const running = new Map<string, { controller: AbortController; chatId: string }>();

export const isRunning = (messageId: string) => running.has(messageId);

function titleFrom(text: string) {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line || "New chat";
}

export type PendingError = { code: string; message: string };
type ErrorListener = (chatId: string, error: PendingError) => void;
const errorListeners = new Set<ErrorListener>();

/** Lets the chat screen react to account-level errors (privacy review, sign-in, credit). */
export function onChatError(listener: ErrorListener) {
  errorListeners.add(listener);
  return () => { errorListeners.delete(listener); };
}

/** How a chat's answers to a message went, once all have ended: "error" if any failed, else "stopped" if any was stopped. */
export type ChatOutcome = "done" | "stopped" | "error";
const OUTCOME_RANK: Record<ChatOutcome, number> = { done: 0, stopped: 1, error: 2 };
const worseOutcome = (a: ChatOutcome, b: ChatOutcome) => (OUTCOME_RANK[b] > OUTCOME_RANK[a] ? b : a);
type SettledListener = (chatId: string, outcome: ChatOutcome) => void;
const settledListeners = new Set<SettledListener>();
/** How the answers that have ended so far went, for each chat with answers still running. */
const outcomes = new Map<string, ChatOutcome>();

/** Hears when a chat's last running answer ends, with how they went (the chat screen plays a haptic). */
export function onChatSettled(listener: SettledListener) {
  settledListeners.add(listener);
  return () => { settledListeners.delete(listener); };
}

// ---- Streaming writes (desktop's workspaceRuntime flushes) ----
// Streamed text goes to the database in small appended rows. Flushes from every running answer share one
// clock on a 20 ms grid and commit together, and an answer whose flushes cost more waits longer (4× the
// cost), so streaming leaves the JS thread free. The answer's full text is written once, when it ends.

const FLUSH_MIN_MS = 500;
const FLUSH_MAX_MS = 2_000;
const flushes = new Map<string, { due: number; take(): StreamDelta | null; cost(ms: number): void }>();
let flushClock: ReturnType<typeof setTimeout> | undefined;

function armFlushClock() {
  if (flushClock || !flushes.size) return;
  const next = Math.min(...[...flushes.values()].map((flush) => flush.due));
  flushClock = setTimeout(() => {
    flushClock = undefined;
    const now = Date.now();
    const due = [...flushes].filter(([, flush]) => flush.due <= now);
    for (const [id] of due) flushes.delete(id);
    const deltas = due.map(([, flush]) => flush.take()).filter((delta): delta is StreamDelta => Boolean(delta));
    const started = performance.now();
    try {
      appendDeltas(deltas);
      perf?.count("stream.flush", deltas.length);
    } catch {
      // The final write still saves the answer; a failed flush only narrows what a crash would keep.
    }
    const cost = performance.now() - started;
    endTimer("Stream flush", started, () => `${deltas.length} ${deltas.length === 1 ? "answer" : "answers"}`);
    for (const [, flush] of due) flush.cost(cost);
    armFlushClock();
  }, Math.max(0, next - Date.now()));
}

function streamWriter(messageId: string) {
  let content = "";
  let reasoning = "";
  let seq = 0;
  let delay = FLUSH_MIN_MS;
  let closed = false;
  const flush = {
    due: 0,
    take(): StreamDelta | null {
      if (!content && !reasoning) return null;
      const delta = { messageId, seq: seq++, content, reasoning };
      content = "";
      reasoning = "";
      return delta;
    },
    cost(ms: number) { delay = Math.min(FLUSH_MAX_MS, Math.max(FLUSH_MIN_MS, Math.round(ms * 4))); },
  };
  return {
    add(text: string, thought: string) {
      if (closed) return;
      content += text;
      reasoning += thought;
      if (flushes.has(messageId)) return;
      flush.due = Math.ceil((Date.now() + delay) / 20) * 20;
      flushes.set(messageId, flush);
      armFlushClock();
    },
    close() {
      closed = true;
      flushes.delete(messageId);
    },
  };
}

/**
 * What the screen shows while an answer streams, published at most once a frame (and every 200 ms while the
 * unfinished part is long), with the boundaries of its finished chunks worked out from the last one onwards.
 */
function liveWriter(messageId: string) {
  let value: LiveAnswer = { content: "", reasoning: "", phase: "waiting", boundaries: [] };
  let scheduled = false;
  let closed = false;
  const publish = () => {
    scheduled = false;
    if (closed) return;
    const added = streamingBoundaries(value.content, value.boundaries.at(-1) ?? 0);
    if (added.length) value = { ...value, boundaries: [...value.boundaries, ...added] };
    setLive(messageId, value);
  };
  const schedule = () => {
    if (scheduled || closed) return;
    scheduled = true;
    const tail = value.content.length - (value.boundaries.at(-1) ?? 0);
    if (tail > 16_000) setTimeout(publish, 200);
    else requestAnimationFrame(publish);
  };
  setLive(messageId, value);
  return {
    append(text: string, thought: string) {
      value = { ...value, content: value.content + text, reasoning: value.reasoning + thought, phase: "streaming" };
      schedule();
    },
    phase(phase: LiveAnswer["phase"]) {
      value = { ...value, phase };
      setLive(messageId, value);
    },
    get: () => value,
    close() {
      closed = true;
      setLive(messageId, null);
    },
  };
}

/** Creates a chat with its first message (and any settings chosen before it) and starts every model answering. */
export function startChat(args: { text: string; attachments: ChatAttachment[]; models: string[]; modelSettings?: Record<string, ModelSettings>; workspaceId: string | null }) {
  const now = Date.now();
  const chatId = Crypto.randomUUID();
  const modelSettings = Object.fromEntries(Object.entries(args.modelSettings ?? {}).filter(([model]) => args.models.includes(model)));
  createChat({ id: chatId, title: titleFrom(args.text), models: args.models, modelSettings, workspaceId: args.workspaceId, createdAt: now, updatedAt: now, preview: args.text.slice(0, 140) });
  sendMessage({ chatId, text: args.text, attachments: args.attachments, workspaceId: args.workspaceId });
  return chatId;
}

export function sendMessage(args: { chatId: string; text: string; attachments: ChatAttachment[]; workspaceId: string | null }) {
  const chat = getChat(args.chatId);
  if (!chat) return;
  const now = Date.now();
  const user: ChatMessage = { id: Crypto.randomUUID(), chatId: chat.id, role: "user", model: null, parentId: null, content: args.text, reasoning: "", status: "done", error: null, errorCode: null, errorStatus: null, attachments: args.attachments, usage: null, notice: null, createdAt: now, position: nextPosition(chat.id) };
  insertMessage(user);
  updateChat(chat.id, { updatedAt: now, preview: args.text.slice(0, 140) });
  messageAdded(user);
  for (const model of chat.models) void answer(chat.id, user, model, args.workspaceId ?? chat.workspaceId);
  notifyChat(chat.id);
}

/** The gateway reports cost as `cost` or, from phaseo.app's proxy, as `pricing.total_usd_str`. */
function costOf(usage: { cost?: unknown; pricing?: unknown }) {
  if (typeof usage.cost === "number") return usage.cost;
  const total = usage.pricing && typeof usage.pricing === "object" ? (usage.pricing as Record<string, unknown>).total_usd_str : undefined;
  const parsed = typeof total === "string" ? Number(total) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

const toUsage = (usage: { prompt_tokens?: number; completion_tokens?: number; cost?: unknown; pricing?: unknown } | undefined): TokenUsage | undefined =>
  usage ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, costUsd: costOf(usage) } : undefined;

/** The summary request: the same model, provider and proxy as its answers, with the summary instructions instead of the chat's system prompt. */
async function summarise(args: { model: string; settings?: ModelSettings; workspaceId: string | null; signal: AbortSignal; messages: WireMessage[] }) {
  const settings: ModelSettings = { ...args.settings, systemPrompt: undefined, maxOutputTokens: SUMMARY_MAX_TOKENS };
  let text = "";
  const started = startTimer();
  try {
    const result = await streamCompletion({ model: args.model, messages: args.messages, settings, capabilities: await requestCapabilities(args.model, settings), workspaceId: args.workspaceId, signal: args.signal, onText: (delta) => { text += delta; } });
    endTimer("Compaction", started, () => `${args.model}, ${args.messages.length} messages summarised`);
    return { text: result.text, usage: toUsage(result.usage) };
  } catch (error) {
    // A summary that ran out of room is still worth keeping.
    if (error instanceof StreamError && error.code === "max_output_tokens" && text.trim().length > 200) return { text, usage: undefined };
    throw error;
  }
}

/** Runs one model's answer to one user message. */
async function answer(chatId: string, parent: ChatMessage, model: string, workspaceId: string | null, reuse?: ChatMessage) {
  const reset = { content: "", reasoning: "", status: "streaming" as const, error: null, errorCode: null, errorStatus: null, usage: null, notice: null };
  const message: ChatMessage = reuse ? { ...reuse, ...reset } : { id: Crypto.randomUUID(), chatId, role: "assistant", model, parentId: parent.id, attachments: [], createdAt: Date.now(), position: nextPosition(chatId), ...reset };
  if (reuse) {
    finishMessage(message.id, reset);
    messageChanged(chatId, message.id, reset);
  } else {
    insertMessage(message);
    messageAdded(message);
  }

  const controller = new AbortController();
  running.set(message.id, { controller, chatId });
  setRunning(chatId, 1);
  const live = liveWriter(message.id);
  const writer = streamWriter(message.id);
  let prepared: PreparedThread | null = null;
  perf?.streamStarted(message.id);

  let outcome: ChatOutcome = "error";
  const finish = (patch: MessagePatch) => {
    if (patch.status === "done" || patch.status === "stopped" || patch.status === "error") outcome = patch.status;
    writer.close();
    finishMessage(message.id, patch);
    messageChanged(chatId, message.id, patch);
    if (prepared?.summary) summaryAdded(prepared.summary);
  };

  try {
    // Settings are read when the answer starts, so a change applies from the next message or retry.
    const settings = getChat(chatId)?.modelSettings[model];
    const historyStarted = performance.now();
    prepared = await prepareThread({
      chatId,
      model,
      modelLabel: modelLabelFor(model, settings),
      upTo: parent,
      systemPrompt: systemPromptFor(settings),
      contextTokens: contextTokensFor(model),
      signal: controller.signal,
      onSummarising: () => live.phase("summarising"),
      summarise: (messages) => summarise({ model, settings, workspaceId, signal: controller.signal, messages }),
    });
    endTimer("Request history built", historyStarted, () => `${model}, ${prepared?.messages.length ?? 0} messages${prepared?.compacted ? ", with a summary" : ""}`);
    perf?.log("history.build", { model, ms: Math.round(performance.now() - historyStarted), messages: prepared.messages.length, estimate: prepared.estimate, contextTokens: prepared.contextTokens, compacted: prepared.compacted, notice: prepared.notice ?? null });
    if (prepared.summary) {
      summaryAdded(prepared.summary);
      perf?.log("compaction.done", { model, throughPosition: prepared.summary.throughPosition, chars: prepared.summary.summary.length, usage: prepared.summaryUsage ?? null });
    }
    live.phase("waiting");
    const result = await streamCompletion({
      model,
      messages: prepared.messages,
      settings,
      capabilities: await requestCapabilities(model, settings),
      workspaceId,
      signal: controller.signal,
      onText: (text) => { live.append(text, ""); writer.add(text, ""); },
      onReasoning: (text) => { live.append("", text); writer.add("", text); },
    });
    const usage: MessageUsage | null = result.usage || prepared.summaryUsage ? { ...toUsage(result.usage), ...(prepared.summaryUsage ? { summary: prepared.summaryUsage } : {}) } : null;
    finish({ content: result.text, reasoning: result.reasoning, status: "done", usage, notice: prepared.notice ?? null });
    indexAnswer(chatId, result.text);
  } catch (error) {
    const stopped = controller.signal.aborted;
    const text = error instanceof Error ? error.message : "The answer failed.";
    const code = error instanceof ChatRequestError || error instanceof StreamError ? error.code : error instanceof ApiError ? error.code ?? null : null;
    const status = error instanceof ChatRequestError || error instanceof ApiError ? error.status : null;
    const sofar = live.get();
    finish({ content: sofar.content, reasoning: sofar.reasoning, status: stopped ? "stopped" : "error", error: stopped ? null : text, errorCode: stopped ? null : code, errorStatus: stopped ? null : status, usage: prepared?.summaryUsage ? { summary: prepared.summaryUsage } : null, notice: prepared?.notice ?? null });
    if (!stopped && (error instanceof ChatRequestError || error instanceof ApiError)) for (const listener of errorListeners) listener(chatId, { code: code ?? "", message: text });
  } finally {
    perf?.streamFinished(message.id, { chars: live.get().content.length, reasoningChars: live.get().reasoning.length });
    running.delete(message.id);
    setRunning(chatId, -1);
    // The last of the chat's answers to end reports how they all went.
    const overall = worseOutcome(outcomes.get(chatId) ?? "done", outcome);
    if ([...running.values()].some((entry) => entry.chatId === chatId)) outcomes.set(chatId, overall);
    else {
      outcomes.delete(chatId);
      for (const listener of settledListeners) listener(chatId, overall);
    }
    // The window already holds the final text, so clearing the live copy doesn't flash.
    live.close();
    updateChat(chatId, { updatedAt: Date.now() });
    notifyChat(chatId);
  }
}

export function stopAnswer(messageId: string) {
  running.get(messageId)?.controller.abort();
}

export function stopChat(chatId: string) {
  for (const entry of running.values()) if (entry.chatId === chatId) entry.controller.abort();
}

/** Stops every answer that is streaming (before deleting all chats). */
export function stopAllAnswers() {
  for (const entry of running.values()) entry.controller.abort();
}

/** Re-runs one answer in place with the same model. */
export function retryAnswer(message: ChatMessage, workspaceId: string | null) {
  if (message.role !== "assistant" || !message.parentId || !message.model || running.has(message.id)) return;
  const parent = getMessage(message.parentId);
  if (!parent) return;
  void answer(message.chatId, parent, message.model, workspaceId, message);
}

/** Edits a user message: everything after it is discarded and the models answer again. */
export function editAndResend(message: ChatMessage, text: string, workspaceId: string | null) {
  stopChat(message.chatId);
  deleteMessagesFrom(message.chatId, message.position);
  chatReloaded(message.chatId);
  sendMessage({ chatId: message.chatId, text, attachments: message.attachments, workspaceId });
}

/** Copies a chat up to and including a message into a new chat (the website's "Branch"), with the kept models' settings. */
export function forkChat(message: ChatMessage, workspaceId: string | null) {
  const source = getChat(message.chatId);
  if (!source) return null;
  const now = Date.now();
  const chatId = Crypto.randomUUID();
  const models = message.role === "assistant" && message.model ? [message.model] : source.models;
  const modelSettings = Object.fromEntries(Object.entries(source.modelSettings).filter(([model]) => models.includes(model)));
  createChat({ id: chatId, title: `${source.title} (branch)`, models, modelSettings, workspaceId, createdAt: now, updatedAt: now, preview: source.preview });
  copyMessages({ from: message.chatId, to: chatId, upTo: message.position, models, newId: () => Crypto.randomUUID() });
  notifyChat(chatId);
  return chatId;
}
