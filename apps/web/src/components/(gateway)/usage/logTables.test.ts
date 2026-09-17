import { normalizeTableColumns } from "./tablePreferences";
import { JOB_COLUMNS, SESSION_COLUMNS, UPSTREAM_COLUMNS, REALTIME_COLUMNS } from "./logColumns";
import { getSessionPrimary } from "./sessionPrimary";
import { groupUpstreamGenerations } from "./upstreamGenerations";
import type { UsageUpstreamRequestRow } from "@/lib/fetchers/internal/settingsTypes";

describe("log table preferences", () => {
	it.each([{ columns: UPSTREAM_COLUMNS }, { columns: SESSION_COLUMNS }, { columns: JOB_COLUMNS }, { columns: REALTIME_COLUMNS }])("repairs saved preferences while retaining pin order and visibility", ({ columns }) => {
		const normalized = normalizeTableColumns([
			{ id: "cost", visible: false }, { id: "model", visible: true, pinned: true },
			{ id: "date", visible: true, pinned: true }, { id: "date", visible: false },
			{ id: "unknown", visible: true },
		], columns);
		expect(normalized.map(({ id }) => id).sort()).toEqual(columns.map(({ id }) => id).sort());
		expect(normalized.filter(({ pinned }) => pinned).map(({ id }) => id)).toEqual(columns.some(({ id }) => id === "model") ? ["model", "date"] : ["date"]);
	});
	it("keeps one column visible and makes newly added columns available", () => {
		const allHidden = JOB_COLUMNS.map(({ id }) => ({ id, visible: false }));
		expect(normalizeTableColumns(allHidden, JOB_COLUMNS).filter(({ visible }) => visible)).toHaveLength(1);
		expect(normalizeTableColumns(allHidden.slice(0, 4), JOB_COLUMNS).find(({ id }) => id === "cost")?.visible).toBe(true);
	});
});

describe("session primary model and provider", () => {
	it("pairs the most-used model with its own most-used provider, rather than the busiest provider overall", () => {
		const result = getSessionPrimary({ model_ids: ["b", "a"], model_counts: [{ model_id: "b", request_count: 4 }, { model_id: "a", request_count: 6 }], model_provider_counts: [
			{ model_id: "b", provider: "wrong", request_count: 4 },
			{ model_id: "a", provider: "right", request_count: 3 },
			{ model_id: "a", provider: "z", request_count: 3 },
		] });
		expect(result.primary?.model_id).toBe("a");
		expect(result.provider).toBe("right");
		expect(result.other.map(({ model_id }) => model_id)).toEqual(["b"]);
	});
	it("does not invent a primary model or provider when historical counts are unavailable", () => {
		expect(getSessionPrimary({ model_ids: ["a", "b"] })).toMatchObject({ primary: null, provider: null });
		expect(getSessionPrimary({ model_ids: ["a"] })).toMatchObject({ primary: { model_id: "a" }, provider: null });
	});
});

describe("upstream generation grouping", () => {
	const attempt = (overrides: Partial<UsageUpstreamRequestRow>) => ({ id: "one", gateway_request_id: "gen", request_id: "req", created_at: "2026-09-17T12:00:00Z", sequence: 1, provider: "failed", status_code: 429, ...overrides }) as UsageUpstreamRequestRow;
	it("produces one final-provider row, retains failed attempts, and preserves zero latency", () => {
		const first = attempt({});
		const last = attempt({ id: "two", sequence: 2, provider: "working", status_code: 200, request_latency_ms: 0 });
		const rows = groupUpstreamGenerations([last, first, first]);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ provider: "working", status_code: 200, totalAttempts: 2, request_latency_ms: 0 });
		expect(rows[0].attempts).toHaveLength(2);
	});
	it("retains reported total attempts when the time range omits earlier attempts", () => {
		expect(groupUpstreamGenerations([attempt({ sequence: 3, attempt_count: 4 })])[0].totalAttempts).toBe(4);
	});
	it("keeps distinct generations separate", () => {
		expect(groupUpstreamGenerations([attempt({}), attempt({ id: "other", gateway_request_id: "other" })])).toHaveLength(2);
	});
});
