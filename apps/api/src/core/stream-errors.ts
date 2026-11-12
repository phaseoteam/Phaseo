// Purpose: Recognise upstream failures reported inside an already-started stream.
// Why: Every dialect reports a mid-stream failure differently, and each stream
// transform and the materialiser must treat them as failures, not completions.
// How: Small shape checks shared by executors and the pipeline.

import type { IRChatResponse } from "./ir";

/**
 * OpenAI-compatible Chat Completions providers report a failure after the
 * stream started as a bare `{"error": {...}}` data frame, with no `object`,
 * `type` or `choices`.
 */
export function isBareChatErrorFrame(frame: any): boolean {
	return Boolean(
		frame &&
		typeof frame === "object" &&
		frame.error &&
		typeof frame.error === "object" &&
		frame.object === undefined &&
		frame.type === undefined &&
		!Array.isArray(frame.choices),
	);
}

/**
 * Reads the code and message from any mid-stream error shape: a bare Chat
 * `{"error": {...}}` frame, a Responses `error` event (`code`/`message` at the
 * top level), `response.failed` (`response.error`), or an Anthropic `error`
 * event (`error.type`/`error.message`).
 */
export function readUpstreamStreamError(payload: any): { code: string | null; message: string } {
	const nested = payload?.response?.error ?? payload?.error;
	const source = nested && typeof nested === "object" ? nested : payload;
	const message = typeof source?.message === "string" && source.message.length > 0
		? source.message
		: (typeof payload?.message === "string" && payload.message.length > 0 ? payload.message : "stream_error");
	const rawCode = source?.code ?? source?.type ?? payload?.code ?? null;
	const code = typeof rawCode === "string" && rawCode.length > 0 && rawCode !== "error"
		? rawCode
		: (typeof rawCode === "number" ? String(rawCode) : null);
	return { code, message };
}

/**
 * The upstream reported a failure after its stream had started (an `error`
 * frame, `response.failed`, or an Anthropic `error` event). Thrown once the
 * stream has been drained, so callers still see the partial output and usage.
 */
export class UpstreamStreamError extends Error {
	readonly upstreamMessage: string;
	readonly partial: { ir: IRChatResponse; rawResponse: any; usageRaw: any };
	constructor(upstreamMessage: string, partial: { ir: IRChatResponse; rawResponse: any; usageRaw: any }) {
		super("upstream_stream_failure");
		this.name = "UpstreamStreamError";
		this.upstreamMessage = upstreamMessage;
		this.partial = partial;
	}
}
