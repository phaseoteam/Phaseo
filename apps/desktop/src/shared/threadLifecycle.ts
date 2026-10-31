/**
 * Code-mode chat lifecycle, after T3 Code: settle parks a chat once you are done with it, snooze hides it until a time,
 * and chats left alone settle on their own. "active" means the person un-settled the chat, which holds off auto-settle
 * until something new happens in it.
 */
export type ThreadLifecycle = {
	pinned: boolean; archived: boolean; status: string;
	settledOverride?: "settled" | "active"; settledAt?: string; unsettledAt?: string;
	snoozedUntil?: string; snoozedAt?: string; lastSnoozeWakeAt?: string;
	lastVisitedAt?: string; autoSettle?: boolean; orderKey?: number;
	createdAt: string; updatedAt: string;
	/** When the latest turn finished, and when the person last wrote. */
	lastCompletedAt?: string; lastUserMessageAt?: string;
	approvalsCount: number; answersCount: number; queueCount?: number;
	/** Linked pull requests as last seen: open, closed or merged, and when that was. */
	pullRequests?: { source?: string; snapshot?: { state: "open" | "closed" | "merged"; updatedAt: string } }[];
};
export type AutoSettleRules = { days: number | null; onMerge: boolean; keepPullRequests: boolean };

export type SidebarSection = "pinned" | "active" | "snoozed" | "settled";
export const autoSettleDays = { default: 3, minimum: 1, maximum: 90 };

const time = (value?: string) => value ? Date.parse(value) : 0;

/** Why a chat cannot settle yet, in T3's words, or nothing when it can. */
export function settleBlocker(thread: Pick<ThreadLifecycle, "status" | "approvalsCount" | "answersCount" | "queueCount">) {
	if (thread.approvalsCount || thread.answersCount) return "This chat is waiting on an approval or question. Answer it before settling.";
	if (thread.status === "running" || thread.status === "waiting") return "This chat is still running. Stop it before settling.";
	if (thread.queueCount) return "This chat has a queued message. Send it or remove it from the queue before settling.";
}

export function snoozeBlocker(thread: Pick<ThreadLifecycle, "approvalsCount" | "answersCount" | "queueCount">, until: string, now = Date.now()) {
	if (!(time(until) > now)) return "Choose a time in the future.";
	if (thread.approvalsCount || thread.answersCount) return "This chat is waiting on an approval or question. Answer it before snoozing.";
	if (thread.queueCount) return "This chat has a queued message. Send it or remove it from the queue before snoozing.";
}

/** A snoozed chat comes back early when it needs the person, fails, or finishes a turn after it was snoozed. */
export function raisedHand(thread: ThreadLifecycle) {
	if (!thread.snoozedUntil) return false;
	if (thread.approvalsCount || thread.answersCount) return true;
	const since = time(thread.snoozedAt);
	if (["failed", "limited", "interrupted"].includes(thread.status) && time(thread.updatedAt) > since) return true;
	return time(thread.lastCompletedAt) > since;
}

export function isSnoozed(thread: ThreadLifecycle, now = Date.now()) {
	return Boolean(thread.snoozedUntil) && time(thread.snoozedUntil) > now && !raisedHand(thread);
}

/** Snoozed until a moment that has passed, or brought back early: shown as "Woke" until dismissed. */
export function hasWoken(thread: ThreadLifecycle, now = Date.now()) {
	return Boolean(thread.snoozedUntil) && !isSnoozed(thread, now);
}

export const isSettled = (thread: ThreadLifecycle) => thread.settledOverride === "settled";

export function sidebarSection(thread: ThreadLifecycle, now = Date.now()): SidebarSection {
	if (isSnoozed(thread, now)) return "snoozed";
	if (isSettled(thread)) return "settled";
	if (thread.pinned) return "pinned";
	return "active";
}

/** A finished turn the person has not looked at since. Chats never opened count as read. */
export function isUnread(thread: ThreadLifecycle) {
	return Boolean(thread.lastVisitedAt && thread.lastCompletedAt) && time(thread.lastCompletedAt) > time(thread.lastVisitedAt);
}

export function lastActivity(thread: ThreadLifecycle, now = Date.now()) {
	const wake = thread.snoozedUntil && time(thread.snoozedUntil) <= now ? time(thread.snoozedUntil) : 0;
	return Math.max(time(thread.createdAt), time(thread.lastUserMessageAt), time(thread.lastCompletedAt), time(thread.lastSnoozeWakeAt), wake);
}

/** When an idle chat should count as settled (its last activity), or nothing if it should stay. */
export function autoSettleAt(thread: ThreadLifecycle, rules: AutoSettleRules | number | null, now = Date.now()) {
	const { days, onMerge, keepPullRequests } = typeof rules === "object" && rules !== null ? rules : { days: rules, onMerge: true, keepPullRequests: false };
	if (thread.archived || thread.settledOverride || thread.pinned || thread.autoSettle === false) return;
	if (thread.approvalsCount || thread.answersCount || thread.queueCount || ["running", "waiting"].includes(thread.status)) return;
	if (isSnoozed(thread, now)) return;
	// T3's pull request rule: any open (or never read) linked pull request holds the chat; one closed, or merged
	// with onMerge, settles it, but only if that happened after the person last wrote.
	const linked = (thread.pullRequests ?? []).filter(link => link.source !== "stack-dismissed");
	if (linked.length) {
		if (linked.some(link => !link.snapshot || link.snapshot.state === "open")) return;
		const finished = linked.filter(link => link.snapshot!.state === "closed" || (onMerge && link.snapshot!.state === "merged")).map(link => time(link.snapshot!.updatedAt));
		const latest = Math.max(0, ...finished);
		if (finished.length && latest >= time(thread.lastUserMessageAt)) return new Date(latest).toISOString();
		if (keepPullRequests) return;
	}
	if (days === null) return;
	const last = lastActivity(thread, now);
	if (now - last >= days * 86_400_000) return new Date(last).toISOString();
}

/** Where a chat sits in the active list: newest first by when it began or came back. Activity does not reorder it. */
export const activeOrder = (thread: ThreadLifecycle) => Math.max(time(thread.createdAt), time(thread.unsettledAt));

export type SnoozePreset = { label: string; until: Date };
/** T3's snooze choices: an hour, three hours, this evening (if over an hour away), tomorrow 9:00, next Monday 9:00. */
export function snoozePresets(now = new Date()): SnoozePreset[] {
	const at = (days: number, hour: number) => { const value = new Date(now); value.setDate(value.getDate() + days); value.setHours(hour, 0, 0, 0); return value; };
	const presets: SnoozePreset[] = [{ label: "In 1 hour", until: new Date(now.getTime() + 3_600_000) }, { label: "In 3 hours", until: new Date(now.getTime() + 3 * 3_600_000) }];
	const evening = at(0, 18);
	if (evening.getTime() - now.getTime() > 3_600_000) presets.push({ label: "This evening", until: evening });
	const tomorrow = at(1, 9);
	presets.push({ label: "Tomorrow", until: tomorrow });
	const monday = at((8 - now.getDay()) % 7 || 7, 9);
	if (monday.getTime() !== tomorrow.getTime()) presets.push({ label: "Next week", until: monday });
	return presets;
}

/** "now", "4m", "2h", "3d": how long ago, or how long until. */
export function shortDuration(milliseconds: number) {
	const minutes = Math.round(Math.abs(milliseconds) / 60_000);
	if (minutes < 1) return "now";
	if (minutes < 60) return `${minutes}m`;
	if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
	return `${Math.round(minutes / 60 / 24)}d`;
}
