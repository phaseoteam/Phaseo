import { getSupabaseAdmin } from "@/runtime/env";

// Spend report emails. Every 5 minutes (behind SPEND_REPORTS_ENABLED, off by default),
// public.queue_spend_reports queues the reports that are due: daily at 09:00 for the day before,
// weekly on Monday at 09:00 for the previous ISO week, or monthly on the 1st at 09:00 for the
// previous month, all in each workspace's billing_time_zone (due until 21:00 so a late tick still
// sends it that day). The database computes every figure (private.spend_report_facts), skips
// periods without spend and handles each workspace, cadence and period once. Each report is one
// routed spend_report event (the workspace's spend_report routes, sent by the notification delivery
// job) plus one spend_report_email per owner, and per admin when the workspace includes them,
// that the legacy email drain sends (spend-report-email.ts renders it). Dedupe keys are stable per
// workspace, cadence, period and recipient, so a retried tick never sends a report twice.

export const SPEND_REPORTS_QUEUE_LIMIT = 50;

export type SpendReportQueued = {
	workspaceId: string;
	cadence: "daily" | "weekly" | "monthly";
	periodStart: string;
	eventId: string | null;
	dedupeKey: string;
	emails: number;
	spendNanos: number;
};

export type SpendReportQueueSummary = {
	skippedLocked: boolean;
	/** Workspaces whose report was due this tick (queued, skipped or already sent). */
	due: number;
	/** Due workspaces skipped without computing a report: no spend in the period. */
	quiet: number;
	/** Reports computed and skipped because the period's spend was 0 (free models only). */
	zeroSpend: number;
	queued: number;
	emails: number;
	reports: SpendReportQueued[];
};

const count = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const cadenceOf = (value: unknown): SpendReportQueued["cadence"] => (value === "daily" || value === "monthly" ? value : "weekly");

export function parseSpendReportQueueSummary(data: unknown): SpendReportQueueSummary {
	const result = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const reports = (Array.isArray(result.reports) ? result.reports : []) as Array<Record<string, unknown>>;
	return {
		skippedLocked: result.skipped_locked === true,
		due: count(result.due),
		quiet: count(result.quiet),
		zeroSpend: count(result.zero_spend),
		queued: count(result.queued),
		emails: count(result.emails),
		reports: reports.map((report) => ({
			workspaceId: String(report.workspace_id ?? ""),
			cadence: cadenceOf(report.cadence),
			periodStart: String(report.period_start ?? ""),
			eventId: typeof report.event_id === "string" && report.event_id ? report.event_id : null,
			dedupeKey: String(report.dedupe_key ?? ""),
			emails: count(report.emails),
			spendNanos: count(report.spend_nanos),
		})),
	};
}

/** True when a run did anything worth a log line. */
export function hasSpendReportActivity(summary: SpendReportQueueSummary): boolean {
	return summary.due > 0 || summary.queued > 0 || summary.skippedLocked;
}

export async function runSpendReportsQueue(options: { now?: Date; limit?: number } = {}): Promise<SpendReportQueueSummary> {
	const { data, error } = await getSupabaseAdmin().rpc("queue_spend_reports", {
		p_now: (options.now ?? new Date()).toISOString(),
		p_limit: options.limit ?? SPEND_REPORTS_QUEUE_LIMIT,
	});
	if (error) throw new Error(`spend_reports_queue_failed:${error.message}`);
	return parseSpendReportQueueSummary(data);
}
