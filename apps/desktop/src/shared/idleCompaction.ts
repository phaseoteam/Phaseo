import type { IdleCompactionMode } from "./threadPreferences";
import { usageTokens } from "./usageAmounts";
import type { Task } from "./workspace";

/** Agents that compact their own context on "/compact": Phaseo's agent, Claude Code, Codex, OpenCode and Pi. */
export const compactingHarnesses = ["phaseo", "claude", "codex", "opencode", "pi"];
/** Prompt caches last about five minutes after the last request (Anthropic's default; OpenAI's in-memory cache is similar). */
export const promptCacheMs = 5 * 60_000;
/** Compacting just before the cache expires leaves this long for the summary request to reach the provider. */
export const compactBeforeExpiryMs = 60_000;
/** Below this, re-reading the history uncached costs about as much as a summary, so compacting saves nothing. */
export const idleCompactionTokens = 100_000;

type IdleChat = Pick<Task, "harness" | "status" | "archived" | "nativeSessionId" | "queue" | "snoozedUntil" | "settledOverride" | "messages" | "activities">;

/** How much context the chat's next turn would send: the last usage report's input when there is one, otherwise its stored text (about 4 characters a token). */
export function contextTokens(chat: Pick<Task, "messages" | "activities">) {
	for (const activity of [...chat.activities ?? []].reverse()) {
		// Autopilot's reports are its own model's calls, not this chat's context.
		if (activity.type !== "usage" || activity.id.includes("autopilot:")) continue;
		const tokens = usageTokens(activity.text);
		if (tokens) return tokens.input + tokens.cached + tokens.cacheWrite;
	}
	const characters = chat.messages.reduce((sum, message) => sum + message.text.length, 0) + (chat.activities ?? []).reduce((sum, activity) => sum + activity.text.length, 0);
	return Math.round(characters / 4);
}

/** When the chat's latest turn finished, in milliseconds, or nothing while one runs or none has. */
export function lastTurnEnded(chat: Pick<Task, "messages">) {
	const message = chat.messages.findLast(value => value.role === "user");
	return message?.completedAt ? Date.parse(message.completedAt) : undefined;
}

/**
 * Whether to compact an idle chat now (Settings → Threads → Compact idle chats). "beforeCacheExpires" compacts on a timer
 * in the minute before the prompt cache lapses, so the summary reads the history at the cached price; "onReturn" compacts
 * before the person's next message once the cache has lapsed, so later turns send the summary rather than the whole history.
 * Only large chats on agents that can compact, never twice in a row, and the timer leaves parked and busy chats alone.
 */
export function idleCompactionDue(chat: IdleChat, mode: IdleCompactionMode, trigger: "timer" | "return", now = Date.now()) {
	if ((mode === "beforeCacheExpires" ? "timer" : mode === "onReturn" ? "return" : undefined) !== trigger) return false;
	if (!compactingHarnesses.includes(chat.harness) || !chat.nativeSessionId || chat.archived || chat.status !== "completed") return false;
	if (chat.messages.findLast(message => message.role === "user")?.text.trim() === "/compact") return false;
	const ended = lastTurnEnded(chat);
	if (ended === undefined) return false;
	const idle = now - ended;
	if (trigger === "timer") {
		if (chat.queue.length || chat.settledOverride === "settled" || (chat.snoozedUntil && Date.parse(chat.snoozedUntil) > now)) return false;
		if (idle < promptCacheMs - compactBeforeExpiryMs || idle >= promptCacheMs) return false;
	} else if (idle < promptCacheMs) return false;
	return contextTokens(chat) >= idleCompactionTokens;
}
