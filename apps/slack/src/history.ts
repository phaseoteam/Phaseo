import type { ContextEntry, ThreadContext } from "./coordinator";
import type { TurnRef } from "./turns";

// Which part of a Slack thread a turn reads. Slack lets apps outside the Slack
// Marketplace call conversations.replies about once a minute per workspace, with
// at most 15 messages a call, and returns the earliest messages of the range
// first, so a long thread can't be paged through. Each turn makes one read that
// ends at the message it answers (latest, inclusive):
//
// - It starts at the oldest of the newest KNOWN_IN_READ messages the thread's
//   coordinator already knows, leaving the rest of the 15 for messages written
//   since. While the coordinator knows the whole thread, that is its first message.
// - In a channel the agent only sees mentions, so the read never starts more
//   than LOOKBACK_SECONDS before the message: that bounds how many unseen
//   messages it can hold. Every message in a direct message is a turn, so the
//   coordinator already knows them.
// - The first read in a thread starts LOOKBACK_SECONDS before the message, or at
//   the thread's first message when that is later.
// - Slack sends the thread's first message with every read. When it falls before
//   the read, it is kept apart, so the topic is never lost.
// - When the stretch held more than Slack returned, the prompt says messages are
//   missing, and the coordinator starts again from the message answered.

/** Slack caps non-Marketplace apps at 15 messages per conversations.replies call. */
export const REPLIES_LIMIT = 15;
/** Known messages a read starts from; the rest of the 15 is room for messages written since. */
export const KNOWN_IN_READ = 8;
/** How far back a channel read, or a thread's first read, goes. */
export const LOOKBACK_SECONDS = 30 * 60;
/** Message timestamps a thread's coordinator keeps (never text). */
export const MAX_KNOWN_MESSAGES = 20;

export type SlackHistoryMessage = { ts?: string; user?: string; bot_id?: string; text?: string; subtype?: string };
export type SlackReplies = { messages?: SlackHistoryMessage[]; has_more?: boolean };

/** Orders Slack timestamps ("1792600000.000100"): seconds, then the fraction. */
export function compareTs(a: string, b: string): number {
	const [aSeconds, aFraction = ""] = a.split(".");
	const [bSeconds, bFraction = ""] = b.split(".");
	const seconds = Number(aSeconds) - Number(bSeconds);
	if (seconds) return seconds;
	const x = aFraction.padEnd(8, "0");
	const y = bFraction.padEnd(8, "0");
	return x < y ? -1 : x > y ? 1 : 0;
}

function secondsBefore(ts: string, seconds: number): string {
	const [whole, fraction = "000000"] = ts.split(".");
	return `${Math.max(0, Number(whole) - seconds)}.${fraction}`;
}

function later(a: string, b: string): string {
	return compareTs(a, b) >= 0 ? a : b;
}

export type ReadWindow = {
	/** The first message the read asks for (inclusive). */
	oldest: string;
	/** The read starts at the thread's first message. */
	fromRoot: boolean;
};

/** Where a turn's one read of its thread starts. */
export function readWindow(known: string[], turn: Pick<TurnRef, "threadTs" | "messageTs" | "kind">): ReadWindow {
	const lookback = secondsBefore(turn.messageTs, LOOKBACK_SECONDS);
	const before = known.filter((ts) => compareTs(ts, turn.messageTs) < 0).sort(compareTs);
	let oldest = before.length ? before[Math.max(0, before.length - KNOWN_IN_READ)] : lookback;
	if (turn.kind !== "dm") oldest = later(oldest, lookback);
	return compareTs(oldest, turn.threadTs) <= 0 ? { oldest: turn.threadTs, fromRoot: true } : { oldest, fromRoot: false };
}

function entry(message: SlackHistoryMessage, botUserId: string): ContextEntry {
	return {
		role: message.bot_id || message.user === botUserId ? "assistant" : "user",
		author: message.bot_id ? null : message.user ?? null,
		text: message.text!,
		ts: message.ts ?? null,
	};
}

function hasText(message: SlackHistoryMessage): boolean {
	return typeof message.text === "string" && message.text.trim() !== "";
}

/** The thread so far, without the message being answered. Bot posts are the agent's side. */
export function historyEntries(messages: SlackHistoryMessage[], botUserId: string, messageTs: string): ContextEntry[] {
	return messages.filter((message) => message.ts !== messageTs && hasText(message)).map((message) => entry(message, botUserId));
}

export type ThreadRead = {
	context: ThreadContext;
	/** Every message timestamp the read covered, the answered message's included. */
	ts: string[];
};

/** What one conversations.replies call returned, as the turn's context. */
export function threadRead(response: SlackReplies, window: ReadWindow, turn: Pick<TurnRef, "threadTs" | "messageTs">, botUserId: string): ThreadRead {
	const messages = (response.messages ?? [])
		.filter((message): message is SlackHistoryMessage & { ts: string } => typeof message.ts === "string")
		.sort((a, b) => compareTs(a.ts, b.ts));
	const inRead = messages.filter((message) => compareTs(message.ts, window.oldest) >= 0 && compareTs(message.ts, turn.messageTs) <= 0);
	const replies = inRead.filter((message) => message.ts !== turn.threadTs).length;
	// Slack says whether more of the range is left; without has_more, a full page may have been cut short.
	const partial = typeof response.has_more === "boolean" ? response.has_more : replies >= REPLIES_LIMIT;
	const root = window.fromRoot ? undefined : messages.find((message) => message.ts === turn.threadTs);
	return {
		context: {
			root: root && hasText(root) ? entry(root, botUserId) : null,
			messages: historyEntries(inRead, botUserId, turn.messageTs),
			fromRoot: window.fromRoot,
			partial,
		},
		ts: inRead.map((message) => message.ts),
	};
}
