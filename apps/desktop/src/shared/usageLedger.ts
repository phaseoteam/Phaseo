/** What a billed request was for: a chat's turn, a compaction summary, or one of Autopilot's own calls. */
export type UsageKind = "turn" | "compaction" | "autopilot";
export const usageKind = (id: string): UsageKind => /(?:^|:)autopilot:\d+:usage$/.test(id) ? "autopilot" : /(?:^|:)compaction:\d+:usage$/.test(id) ? "compaction" : "turn";

/** The time inside an Autopilot or compaction report's id (`autopilot:<ms>:usage`), when it carries one. */
export function usageIdTime(id: string): string | undefined {
	const ms = Number(id.match(/(?:autopilot|compaction):(\d{12,14}):usage$/)?.[1]);
	return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : undefined;
}

export type UsageSpend = { costNanos: number; tokens: number };
/**
 * What the Today page reads, summed by the database. Hours are local; `days` lists each local day of the last eight
 * with its spend per hour, today last.
 */
export type TodayReport = {
	generatedAt: string;
	/** The first request the ledger holds; before it, spend wasn't recorded. */
	since?: string;
	today: UsageSpend; last24h: UsageSpend; last7d: UsageSpend;
	/** Spend in chats Autopilot was driving, and in its own calls, today. */
	autopilotToday: UsageSpend & { chats: number };
	days: { day: string; hours: number[] }[];
	chats: (UsageSpend & { taskId: string })[];
	projects: (UsageSpend & { projectId: string | null })[];
	models: (UsageSpend & { model: string })[];
};

/** Today against the days before it, at the same time of day. */
export type TodayPace = {
	/** Today's spend so far, and by the end of each hour so far. */
	cumulative: number[];
	/** Spend by the end of each hour on an average recent day, over the days the ledger covers. */
	usual: number[];
	usualByNow: number;
	/** Today so far plus the usual rest of the day. */
	forecast: number;
	/** How many earlier days the usual is averaged over; 0 when there is no history yet. */
	basedOn: number;
};

/**
 * Pace from the report's hourly spend. "By now" counts the current hour in proportion to how much of it has passed,
 * so the comparison is fair at 10:05 and at 10:55. Days before the ledger started don't count towards the usual.
 */
export function todayPace(report: TodayReport, now = new Date()): TodayPace {
	const hour = now.getHours(), fraction = (now.getMinutes() * 60 + now.getSeconds()) / 3600;
	const running = (hours: number[]) => hours.reduce<number[]>((sums, value) => [...sums, (sums.at(-1) ?? 0) + value], []);
	const today = report.days.at(-1)?.hours ?? Array(24).fill(0) as number[];
	const started = report.since ? localDay(new Date(report.since)) : undefined;
	const earlier = report.days.slice(0, -1).filter(day => started !== undefined && day.day >= started);
	const usual = Array.from({ length: 24 }, (_, index) => earlier.length ? earlier.reduce((sum, day) => sum + running(day.hours)[index], 0) / earlier.length : 0);
	const byNow = (sums: number[]) => (hour ? sums[hour - 1] : 0) + (sums[hour] - (hour ? sums[hour - 1] : 0)) * fraction;
	const usualByNow = earlier.length ? byNow(usual) : 0;
	const cumulative = running(today).slice(0, hour + 1);
	const soFar = report.today.costNanos;
	return { cumulative, usual, usualByNow, forecast: soFar + (earlier.length ? Math.max(0, usual[23] - usualByNow) : 0), basedOn: earlier.length };
}

/** A date as the local day it falls on, YYYY-MM-DD, the same form as the report's days. */
export function localDay(date: Date) {
	const pad = (value: number) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
