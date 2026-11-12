import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { SPEND_REPORTS_QUEUE_LIMIT, hasSpendReportActivity, parseSpendReportQueueSummary, runSpendReportsQueue } from "./spend-reports";

describe("spend reports job", () => {
	beforeEach(() => rpc.mockReset());

	it("calls queue_spend_reports with the tick time and limit and parses its summary", async () => {
		rpc.mockResolvedValueOnce({
			data: {
				skipped_locked: false, due: 4, quiet: 2, zero_spend: 1, queued: 1, emails: 2,
				reports: [{ workspace_id: "ws_1", cadence: "weekly", period_start: "2026-10-11T23:00:00+00:00", event_id: "e1",
					dedupe_key: "spend_report:ws_1:weekly:2026-10-11T23:00:00Z", emails: 2, spend_nanos: 90000000000 }],
			},
			error: null,
		});
		const summary = await runSpendReportsQueue({ now: new Date("2026-10-19T08:30:00Z") });
		expect(rpc).toHaveBeenCalledWith("queue_spend_reports", { p_now: "2026-10-19T08:30:00.000Z", p_limit: SPEND_REPORTS_QUEUE_LIMIT });
		expect(summary).toEqual({
			skippedLocked: false, due: 4, quiet: 2, zeroSpend: 1, queued: 1, emails: 2,
			reports: [{ workspaceId: "ws_1", cadence: "weekly", periodStart: "2026-10-11T23:00:00+00:00", eventId: "e1",
				dedupeKey: "spend_report:ws_1:weekly:2026-10-11T23:00:00Z", emails: 2, spendNanos: 90000000000 }],
		});
		expect(hasSpendReportActivity(summary)).toBe(true);
	});

	it("throws on a database error so the tick logs it", async () => {
		rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
		await expect(runSpendReportsQueue({ limit: 5 })).rejects.toThrow("spend_reports_queue_failed:boom");
		expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_limit: 5 });
	});

	it("reads an empty or locked run as no activity (locked is worth a log line)", () => {
		const idle = parseSpendReportQueueSummary({ skipped_locked: false, due: 0, quiet: 0, zero_spend: 0, queued: 0, emails: 0, reports: [] });
		expect(hasSpendReportActivity(idle)).toBe(false);
		expect(hasSpendReportActivity(parseSpendReportQueueSummary(null))).toBe(false);
		expect(hasSpendReportActivity(parseSpendReportQueueSummary({ skipped_locked: true }))).toBe(true);
		expect(parseSpendReportQueueSummary({ reports: [{ cadence: "hourly", event_id: null }] }).reports[0]).toMatchObject({ cadence: "weekly", eventId: null });
	});
});
