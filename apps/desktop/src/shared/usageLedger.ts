/** What a billed request was for: a chat's turn, a compaction summary, or one of Autopilot's own calls. */
export type UsageKind = "turn" | "compaction" | "autopilot";
export const usageKind = (id: string): UsageKind => /(?:^|:)autopilot:\d+:usage$/.test(id) ? "autopilot" : /(?:^|:)compaction:\d+:usage$/.test(id) ? "compaction" : "turn";

/** The time inside an Autopilot or compaction report's id (`autopilot:<ms>:usage`), when it carries one. */
export function usageIdTime(id: string): string | undefined {
	const ms = Number(id.match(/(?:autopilot|compaction):(\d{12,14}):usage$/)?.[1]);
	return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined;
}

/**
 * Tokens by type. `input` is the input not read from the cache; `cached` was read from it and `cacheWrite` written to
 * it. `reasoning` is part of `output`, kept apart only to show it.
 */
export type UsageTokens = { input: number; cached: number; cacheWrite: number; output: number; reasoning: number };
export const noTokens = (): UsageTokens => ({ input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 });
export const tokenTotal = (tokens: UsageTokens) => tokens.input + tokens.cached + tokens.cacheWrite + tokens.output;

/** One harness response's tokens, as the harness reported it; `key` identifies the response so a rewritten report replaces it. */
export type HarnessUsage = UsageTokens & { key: string; model?: string };

/** USD per million tokens for one model, from Phaseo's catalogue. Cache prices fall back to the input price. */
export type TokenPrices = { input: number; output: number; cacheRead?: number; cacheWrite?: number };

/** What some usage cost: what Phaseo charged, what the rest would cost at API prices, and the tokens no price covers. */
export type UsageCost = {
	tokens: number;
	/** Charged plus estimate, in nanodollars. */
	costNanos: number;
	chargedNanos: number;
	estimateNanos: number;
	/** Tokens with no charge and no catalogue price; they count towards tokens but not cost. */
	unpricedTokens: number;
};
export const noCost = (): UsageCost => ({ tokens: 0, costNanos: 0, chargedNanos: 0, estimateNanos: 0, unpricedTokens: 0 });

/** Today, or the last 7, 30 or 90 days counting today. */
export type UsagePeriod = "today" | "7d" | "30d" | "90d";
export const usagePeriods: { id: UsagePeriod; label: string; days: number }[] = [
	{ id: "today", label: "Today", days: 1 }, { id: "7d", label: "7 days", days: 7 }, { id: "30d", label: "30 days", days: 30 }, { id: "90d", label: "90 days", days: 90 },
];

/** Counts of what got done in the period. Pull requests are absent when GitHub couldn't be asked. */
export type UsageActivity = { chatsStarted: number; chatsFinished: number; chatsSettled: number; autopilotChats: number; pullRequests?: { opened: number; merged: number } };

/**
 * What the Usage page reads for one period. The database sums the ledger by harness and model; the main process
 * prices those sums. Buckets are local hours for today and local days otherwise, oldest first.
 */
export type UsageReport = {
	generatedAt: string;
	period: UsagePeriod;
	/** Where the period starts: local midnight, today or days ago. */
	from: string;
	/** The first response the ledger holds; before it, usage wasn't recorded. */
	since?: string;
	total: UsageCost & { types: UsageTokens; cacheSavingsNanos: number; chats: number };
	harnesses: (UsageCost & { harness: string; chats: number })[];
	buckets: { start: string; harnesses: Record<string, UsageCost> }[];
	models: (UsageCost & { harness: string; model: string })[];
	chats: (UsageCost & { taskId: string })[];
	projects: (UsageCost & { projectId: string | null })[];
	/** Spend in chats Autopilot was driving, and in its own calls. */
	autopilot: UsageCost & { chats: number };
	activity: UsageActivity;
	/** For today: each local day of the last eight with its cost per hour, today last, for the pace. */
	days?: { day: string; hours: number[] }[];
};

/**
 * What tokens would cost at the given prices, in nanodollars. Output already includes reasoning, so reasoning isn't
 * counted twice.
 */
export function estimateNanos(tokens: UsageTokens, prices: TokenPrices) {
	const dollars = (tokens.input * prices.input + tokens.cached * (prices.cacheRead ?? prices.input) + tokens.cacheWrite * (prices.cacheWrite ?? prices.input) + tokens.output * prices.output) / 1e6;
	return Math.round(dollars * 1e9);
}

/** Today against the days before it, at the same time of day. */
export type TodayPace = {
	/** Today's cost so far, and by the end of each hour so far. */
	cumulative: number[];
	/** Cost by the end of each hour on an average recent day, over the days the ledger covers. */
	usual: number[];
	usualByNow: number;
	/** Today so far plus the usual rest of the day. */
	forecast: number;
	/** How many earlier days the usual is averaged over; 0 when there is no history yet. */
	basedOn: number;
};

/**
 * Pace from the report's hourly cost. "By now" counts the current hour in proportion to how much of it has passed,
 * so the comparison is fair at 10:05 and at 10:55. Days before the ledger started don't count towards the usual.
 */
export function todayPace(report: Pick<UsageReport, "days" | "since">, now = new Date()): TodayPace {
	const hour = now.getHours(), fraction = (now.getMinutes() * 60 + now.getSeconds()) / 3600;
	const running = (hours: number[]) => hours.reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], []);
	const days = report.days ?? [];
	const today = days.at(-1)?.hours ?? Array(24).fill(0) as number[];
	const started = report.since ? localDay(new Date(report.since)) : undefined;
	const earlier = days.slice(0, -1).filter(day => started !== undefined && day.day >= started);
	const usual = Array.from({ length: 24 }, (_, index) => earlier.length ? earlier.reduce((sum, day) => sum + running(day.hours)[index], 0) / earlier.length : 0);
	const byNow = (sums: number[]) => (hour ? sums[hour - 1] : 0) + (sums[hour] - (hour ? sums[hour - 1] : 0)) * fraction;
	const usualByNow = earlier.length ? byNow(usual) : 0;
	const cumulative = running(today).slice(0, hour + 1);
	const soFar = cumulative.at(-1) ?? 0;
	return { cumulative, usual, usualByNow, forecast: soFar + (earlier.length ? Math.max(0, usual[23] - usualByNow) : 0), basedOn: earlier.length };
}

/** A date as the local day it falls on, YYYY-MM-DD, the same form as the report's days. */
export function localDay(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The catalogue form of a harness's model id, for matching: no organisation, no date suffix, dots and dashes alike. */
export function modelMatchKey(id: string) {
	return id.toLowerCase().replace(/^[^/]+\//, "").replace(/-\d{8}$/, "").replace(/\[[^\]]*\]$/, "").replace(/[._]/g, "-");
}
