// Purpose: Apply a client's effort change to Claude without restarting the prompt cache.
// Why: Changing the top-level `output_config.effort` between requests invalidates
//      Claude's cached prefix. Claude's per-message effort (an effort-only `system`
//      message, beta mid-conversation-output-config-2026-07-01) changes the level for
//      later turns and keeps the prefix:
//      https://platform.claude.com/docs/en/build-with-claude/effort-per-message
// How: Every Claude reply carries a sealed effort record (the level it ran at and the
//      conversation's top-level "base" level), which Chat and Responses clients send
//      back with the rest of the reasoning. From those records the gateway keeps the
//      base as the top-level effort, puts each earlier change back as a marker in the
//      same place, and adds a marker when this request asks for a new level. Nothing
//      is stored: the same history always gives the same markers.

import type { IRClaudeEffort, IREffortRecord, IRMessage } from "@core/ir";
import { claudeDefaultEffort } from "@core/claudeModelCapabilities";

export type ClaudeEffortPlan = {
	/** The top-level `output_config.effort` to send; undefined leaves it out. */
	topLevel: IRClaudeEffort | undefined;
	/** Effort-only system messages to place right after the IR message at each index. */
	markersAfter: Map<number, IRClaudeEffort>;
	/** The record this request's reply carries back to the client. */
	record: IREffortRecord;
	/**
	 * How this request's effort was applied:
	 * - `none`: the level did not change (or this is the first turn);
	 * - `per_message`: changed with a marker, keeping the cached prefix;
	 * - `top_level`: changed at the top level, because the history carries no
	 *   effort records or the change came in the middle of a tool loop.
	 */
	mode: "none" | "per_message" | "top_level";
};

/** A user message with new input, as opposed to tool results (role `tool` in IR). */
function isNewInput(message: IRMessage): boolean {
	return message.role === "user";
}

/**
 * Whether the run of non-assistant messages ending at `end` (inclusive) holds new
 * user input. A marker after such a run sets the effort for the reply to it; after
 * tool results only, it would wait for the next user turn instead.
 */
function runHasNewInput(messages: IRMessage[], end: number): boolean {
	for (let index = end; index >= 0; index -= 1) {
		const message = messages[index];
		if (message.role === "assistant") return false;
		if (isNewInput(message)) return true;
	}
	return false;
}

/**
 * Plan the effort for a Claude request.
 *
 * @param requested The effort the client asked for in this request; undefined is the
 *                  model's default.
 */
export function planClaudePerMessageEffort(
	messages: IRMessage[],
	requested: IRClaudeEffort | undefined,
	model: string | null | undefined,
): ClaudeEffortPlan {
	const resolve = (level: IRClaudeEffort | "default" | undefined): IRClaudeEffort =>
		level === undefined || level === "default" ? claudeDefaultEffort(model) : level;
	const requestedLevel = resolve(requested);
	const fresh = (mode: ClaudeEffortPlan["mode"]): ClaudeEffortPlan => ({
		topLevel: requested,
		markersAfter: new Map(),
		record: { effort: requestedLevel, base: requested ?? "default" },
		mode,
	});

	let lastAssistant = -1;
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		if (messages[index].role === "assistant") {
			lastAssistant = index;
			break;
		}
	}
	const latest = lastAssistant >= 0 ? (messages[lastAssistant] as Extract<IRMessage, { role: "assistant" }>).effortRecord : undefined;
	// No record on the latest reply: either the first turn, or a client that does not
	// send reasoning back. Either way the gateway cannot know earlier levels.
	if (!latest) return fresh("none");

	const base = latest.base;
	let current = resolve(base);
	const markersAfter = new Map<number, IRClaudeEffort>();
	for (let index = 0; index < messages.length; index += 1) {
		const message = messages[index];
		if (message.role !== "assistant" || !message.effortRecord) continue;
		// Records from before the last top-level change belong to a prefix the cache
		// no longer holds; the current base is the only one that matters.
		if (message.effortRecord.base !== base) continue;
		if (message.effortRecord.effort === current) continue;
		if (index === 0 || !runHasNewInput(messages, index - 1)) continue;
		markersAfter.set(index - 1, message.effortRecord.effort);
		current = message.effortRecord.effort;
	}

	const topLevel = base === "default" ? undefined : base;
	if (requestedLevel === current) {
		return { topLevel, markersAfter, record: { effort: current, base }, mode: "none" };
	}
	const last = messages.length - 1;
	if (last >= 0 && runHasNewInput(messages, last)) {
		markersAfter.set(last, requestedLevel);
		return { topLevel, markersAfter, record: { effort: requestedLevel, base }, mode: "per_message" };
	}
	// A change between tool-loop steps: a marker here would only apply from the next
	// user turn, so the new level goes top-level and becomes the new base.
	return fresh("top_level");
}

/**
 * The effort in force for the reply to `messages` when explicit effort-only
 * system messages are folded into a top-level value, for routes that do not take
 * them. A marker applies from the next user turn with new input after it, or to
 * the reply to the user turn it directly follows.
 */
export function effectiveEffortFromMarkers(messages: IRMessage[]): IRClaudeEffort | undefined {
	let pending: IRClaudeEffort | undefined;
	let effective: IRClaudeEffort | undefined;
	for (const message of messages) {
		if (message.role === "system" && message.effort) {
			pending = message.effort;
			continue;
		}
		if (isNewInput(message) && pending) {
			effective = pending;
			pending = undefined;
		}
	}
	// A marker after the last user turn applies to this reply when it directly
	// follows new input; otherwise it waits for the next user turn.
	if (pending) {
		const lastNonSystem = [...messages].reverse().find((message) => !(message.role === "system" && message.effort));
		if (lastNonSystem && isNewInput(lastNonSystem)) effective = pending;
	}
	return effective;
}

/** True when the request already carries explicit effort-only system messages. */
export function hasExplicitEffortMarkers(messages: IRMessage[]): boolean {
	return messages.some((message) => message.role === "system" && message.effort !== undefined);
}
