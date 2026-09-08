import { describe, expect, it, vi } from "vitest";
import { fetchChartData, fetchFunStats, runWithUsageContext } from "./actions";

describe("private usage summary", () => {
	it("starts both chart periods before either finishes and preserves their totals", async () => {
		const pending: Array<(value: unknown) => void> = [];
		const rpc = vi.fn(() => new Promise((resolve) => pending.push(resolve)));
		const result = runWithUsageContext({
			account: { workspaceId: "workspace-a", user: { id: "user-a" }, client: { rpc } },
			env: {},
		} as any, () => fetchChartData({
			range: "1d", keyFilter: "key-a",
			timeRange: { from: "2026-09-06T00:00:00Z", to: "2026-09-07T00:00:00Z" },
		}));
		await vi.waitFor(() => expect(pending).toHaveLength(2));
		expect(rpc.mock.calls).toEqual([
			["get_usage_chart_rollup", { p_team: "workspace-a", p_from: "2026-09-06T00:00:00Z", p_to: "2026-09-07T00:00:00Z", p_bucket: "hour", p_key_id: "key-a" }],
			["get_usage_chart_rollup", { p_team: "workspace-a", p_from: "2026-09-05T00:00:00.000Z", p_to: "2026-09-06T00:00:00.000Z", p_bucket: "hour", p_key_id: "key-a" }],
		]);
		pending[1]({ data: [{ bucket: "2026-09-05T00:00:00Z", provider: "provider-a", model_id: "model-a", requests: 3, tokens: 30, cost: 0.3 }], error: null });
		pending[0]({ data: [{ bucket: "2026-09-06T00:00:00Z", provider: "provider-a", model_id: "model-a", requests: 5, tokens: 50, cost: 0.5 }], error: null });
		expect((await result).totals).toMatchObject({ requests: { current: 5, previous: 3 }, tokens: { current: 50, previous: 30 }, cost: { current: 0.5, previous: 0.3 } });
	});
	it("returns the database summary without fetching rollup rows", async () => {
		const summary = {
			topModel: { name: "model-a", requests: 1200 },
			topProvider: { name: "provider-a", requests: 1200 },
			mostExpensive: { name: "model-a", cost: 1.2 },
			fastestModel: { name: "model-a", speedMs: 101 },
		};
		const rpc = vi.fn().mockResolvedValue({ data: summary, error: null });
		const range = { from: "2026-09-01T12:00:00Z", to: "2026-09-07T23:59:59Z" };
		const result = await runWithUsageContext({
			account: { workspaceId: "workspace-a", user: { id: "user-a" }, client: { rpc } },
			env: {},
		} as any, () => fetchFunStats(range));
		expect(result).toEqual(summary);
		expect(rpc).toHaveBeenCalledExactlyOnceWith("get_private_usage_summary", {
			p_workspace_id: "workspace-a", p_from: range.from, p_to: range.to,
		});
	});

	it("surfaces database failures instead of displaying empty statistics", async () => {
		const error = new Error("database unavailable");
		const rpc = vi.fn().mockResolvedValue({ data: null, error });
		await expect(runWithUsageContext({
			account: { workspaceId: "workspace-a", user: { id: "user-a" }, client: { rpc } },
			env: {},
		} as any, () => fetchFunStats({ from: "2026-09-01", to: "2026-09-07" }))).rejects.toThrow(error);
	});
});
