import type { AccountStatus } from "./workspace";

/**
 * T3's usage-limit recovery. A Claude or Codex turn that stops on a plan limit leaves the chat "limited" with when it
 * stopped, when the limit resets (from the account's limits, else the error text) and, once asked, when it resumes.
 */
export type UsageLimitState = { at: string; resetsAt?: string; resumeAt?: string };
export const usageLimitHarnesses = ["claude", "codex"] as const;

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
	const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
	return sameDay ? time : `${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}
