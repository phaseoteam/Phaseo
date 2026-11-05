import { formatDateParts, formatTime } from "@phaseo/app-kit/format";
import type { AccountStatus } from "./workspace";

/**
 * Usage-limit recovery. A Claude or Codex turn that stops on a plan limit leaves the chat "limited" with when it
 * stopped, when the limit resets (from the account's limits, else the error text) and, once asked, when it resumes.
 */
export type UsageLimitState = { at: string; resetsAt?: string; resumeAt?: string; /** The resume was set by Resume after usage limits, not asked for in the chat. */ autoResume?: true; /** The person cancelled the resume, so the setting leaves this limit alone. */ resumeCancelled?: true; /** Snoozed by Snooze until limits reset. */ snoozed?: true; /** Switch logins at usage limits moved the work to this chat, on this login. */ movedTo?: string; movedToLogin?: string };
export const usageLimitHarnesses = ["claude", "codex"] as const;

type LimitedChat = { status: string; archived?: boolean; settledOverride?: string; snoozedUntil?: string; usageLimit?: UsageLimitState };
/** A limit that reset more than a day ago is left for the person: resuming it on its own would surprise them. */
const staleLimitMs = 86_400_000;

/**
 * What Settings → Threads' usage limit switches do for a limited chat now: when to resume it (a minute after the reset, on
 * the same agent and login; never anywhere else) and until when to snooze it. Nothing when the reset is unknown or stale.
 */
export function limitRecoveryPlan(task: LimitedChat, preferences: { autoResumeLimited: boolean; snoozeLimited: boolean }, now = Date.now()): { resumeAt?: string; snoozeUntil?: string } {
	const limit = task.usageLimit, reset = limit?.resetsAt ? Date.parse(limit.resetsAt) : NaN;
	// A reset no later than the stop is an old window reported with a fresh failure; resuming on it would loop.
	if (task.status !== "limited" || !limit || task.archived || !Number.isFinite(reset) || reset <= Date.parse(limit.at) || now - reset > staleLimitMs) return {};
	const snoozed = task.snoozedUntil ? Date.parse(task.snoozedUntil) : 0;
	const plan: { resumeAt?: string; snoozeUntil?: string } = {};
	// A chat the person snoozed past the reset resumes when it wakes, so the work does not come back early.
	if (preferences.autoResumeLimited && !limit.resumeAt && !limit.resumeCancelled) plan.resumeAt = new Date(Math.max(reset, now, snoozed) + 60_000).toISOString();
	if (preferences.snoozeLimited && !limit.snoozed && reset > now && task.settledOverride !== "settled" && snoozed < reset) plan.snoozeUntil = new Date(reset).toISOString();
	return plan;
}

const limitPattern = /usage[ _-]?limit|hit your (?:usage )?limit|limit reached|rate[ _-]?limit(?:ed)?|out of (?:usage|credits)|quota exceeded|\b429\b/i;

/** Whether a turn's error says a plan limit stopped it, and the reset time when the text gives one. */
export function usageLimitError(message: string, now = Date.now()): { resetsAt?: number } | undefined {
	if (!limitPattern.test(message)) return undefined;
	// Claude Code: "Claude AI usage limit reached|1761580800".
	const epoch = /\|(\d{10})\b/.exec(message);
	if (epoch) return { resetsAt: Number(epoch[1]) * 1000 };
	// Codex: "… try again in 2 hours 13 minutes" (days, hours, minutes or seconds).
	const wait = /try again in ((?:\d+\s*(?:days?|hours?|hrs?|minutes?|mins?|seconds?|secs?)[\s,and]*)+)/i.exec(message);
	if (wait) {
		const unit: Record<string, number> = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 };
		const total = [...wait[1].matchAll(/(\d+)\s*([dhms])/gi)].reduce((sum, [, count, letter]) => sum + Number(count) * unit[letter.toLowerCase()], 0);
		if (total > 0) return { resetsAt: now + total };
	}
	return {};
}

/** When the account's exhausted limit resets, from the limits the app reads (Settings → Usage), in milliseconds. */
export function limitResetAt(status: Pick<AccountStatus, "usage">, now = Date.now()) {
	const windows = (status.usage ?? []).flatMap(bucket => [bucket.primary, bucket.secondary]).filter(window => window && window.resetsAt && window.resetsAt * 1000 > now);
	const exhausted = windows.filter(window => window!.usedPercent >= 100);
	// The latest reset among the exhausted windows is when every one of them allows work again.
	const pick = exhausted.map(window => window!.resetsAt! * 1000);
	return pick.length ? Math.max(...pick) : undefined;
}

/** A short local time for the reset, with the day when it is not today. */
export function resetLabel(iso: string, now = new Date()) {
	const date = new Date(iso), sameDay = date.toDateString() === now.toDateString();
	const time = formatTime(date);
	return sameDay ? time : `${formatDateParts(date, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/** Whether a login's limits stop ordinary work now: a window at 100% that has not reset, or a spend control reached. */
export function outOfUsage(status: Pick<AccountStatus, "usage" | "ordinaryUsageAllowed">, now = Date.now()) {
	if (status.ordinaryUsageAllowed === false) return true;
	return (status.usage ?? []).some(bucket => bucket.spendControlReached === true || [bucket.primary, bucket.secondary].some(window => window && window.usedPercent >= 100 && (!window.resetsAt || window.resetsAt * 1000 > now)));
}

/** A login another chat could continue on, keyed as Settings → Usage keys its readings (the harness for the default login). */
export type ContinueLogin = { key: string; harness: string; accountId?: string; title: string };

/**
 * Other logins for the same agent that are signed in and have usage left. Logins not read yet are left out rather than
 * offered on a guess.
 */
export function otherLogins<T extends ContinueLogin>(current: { harness: string; accountId?: string }, logins: T[], statuses: Record<string, Pick<AccountStatus, "authenticated" | "usage" | "ordinaryUsageAllowed"> | undefined>, now = Date.now()) {
	return logins.filter(login => login.harness === current.harness && (login.accountId ?? "") !== (current.accountId ?? "")
		&& statuses[login.key]?.authenticated === true && !outOfUsage(statuses[login.key]!, now));
}

type CatalogModel = { id: string; name: string; default?: boolean; facts?: { inputPrice?: number; outputPrice?: number } };
const comparable = (id: string) => id.slice(id.lastIndexOf("/") + 1).toLowerCase().replace(/[^a-z0-9]+/g, "-");

/**
 * The Phaseo model to offer for a limited chat: the same model when the catalogue lists it under the same name, else the
 * person's own Phaseo choice, else the catalogue's default. The offer names the model, so nothing is substituted unseen.
 */
export function phaseoContinuation<T extends CatalogModel>(model: string, catalog: T[], preferred?: string): T | undefined {
	const wanted = comparable(model);
	return catalog.find(entry => comparable(entry.id) === wanted) ?? catalog.find(entry => entry.id === preferred) ?? catalog.find(entry => entry.default) ?? catalog[0];
}

/** "$3/$15 per million tokens" for input and output; undefined when the catalogue lists no price. */
export function perMillionPrice(facts: CatalogModel["facts"], format: (value: number) => string) {
	if (facts?.inputPrice === undefined || facts.outputPrice === undefined) return undefined;
	if (!facts.inputPrice && !facts.outputPrice) return "free";
	return `${format(facts.inputPrice)}/${format(facts.outputPrice)} per million tokens`;
}
