import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";

type Call = { table: string; op: string; args: unknown[] };

const supabase = vi.hoisted(() => ({
	tables: {} as Record<string, unknown[]>,
	calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
	failingReads: new Set<string>(),
	bindings: {} as Record<string, string>,
}));

vi.mock("@/runtime/env", () => {
	const WRITE_OPS = new Set(["insert", "upsert", "update", "delete"]);
	// Chainable PostgREST stand-in: records every write and answers reads from `supabase.tables`.
	const from = (table: string) => {
		let op = "select";
		const builder: Record<string, unknown> = new Proxy({}, {
			get(_target, prop: string) {
				if (prop === "then") {
					if (op === "select" && supabase.failingReads.has(table)) {
						return (resolve: (value: unknown) => void) => resolve({ data: null, error: { message: "statement timeout" } });
					}
					const data = op === "select" ? supabase.tables[table] ?? [] : [];
					return (resolve: (value: unknown) => void) => resolve({ data, error: null });
				}
				return (...args: unknown[]) => {
					if (WRITE_OPS.has(prop)) {
						op = prop;
						supabase.calls.push({ table, op: prop, args });
					}
					return builder;
				};
			},
		});
		return builder;
	};
	const client = {
		from,
		rpc: async (name: string, params: unknown) => {
			supabase.calls.push({ table: "rpc", op: name, args: [params] });
			return { data: null, error: null };
		},
	};
	return {
		getBindings: () => supabase.bindings,
		getSupabaseAdmin: () => client,
	};
});

import { runModelDiscoveryJob } from "./index";

const writes = (table: string, op: string): Call[] => supabase.calls.filter((call) => call.table === table && call.op === op);
const upsertedSeenRows = () => writes("model_discovery_seen_models", "upsert")
	.flatMap((call) => call.args[0] as Array<{ provider_id: string; model_id: string }>);

describe("runModelDiscoveryJob", () => {
	let fetchMock: ReturnType<typeof installFetchMock>;

	beforeEach(() => {
		supabase.tables = {};
		supabase.calls = [];
		supabase.failingReads = new Set();
		supabase.bindings = { PRICING_PAGE_MONITOR_ENABLED: "false" };
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		// Every keyless provider endpoint lists the same two models.
		fetchMock = installFetchMock([{
			match: () => true,
			response: () => jsonResponse({ data: [{ id: "model-a" }, { id: "model-b" }] }),
		}]);
	});

	afterEach(() => {
		fetchMock.restore();
		vi.restoreAllMocks();
	});

	it("records a silent baseline for providers with no stored models", async () => {
		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(summary.providersSuccess).toBeGreaterThan(5);
		expect(summary.changes).toEqual([]);
		expect(writes("rpc", "upsert_model_discovery_review_items")).toEqual([]);
		expect(upsertedSeenRows().filter((row) => row.provider_id === "vercel").map((row) => row.model_id)).toEqual(["model-a", "model-b"]);
	});

	it("reports models added after the baseline", async () => {
		supabase.tables.model_discovery_seen_models = [{ provider_id: "vercel", model_id: "model-a", watch_snapshot: null, removal_pending: false }];

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(summary.changes.find((change) => change.providerId === "vercel")).toMatchObject({ added: ["model-b"], removed: [] });
		const reviewRows = writes("rpc", "upsert_model_discovery_review_items")
			.flatMap((call) => (call.args[0] as { p_rows: Array<{ provider_id: string; model_id: string; change_type: string }> }).p_rows);
		expect(reviewRows.filter((row) => row.provider_id === "vercel")).toEqual([
			expect.objectContaining({ model_id: "model-b", change_type: "added" }),
		]);
	});

	it("reports the first models of a provider that was checked recently with an empty list", async () => {
		supabase.tables.model_discovery_provider_status = [
			{ provider_id: "vercel", provider_name: "Vercel AI Gateway", status: "ok", model_count: 0, consecutive_failures: 0, last_success_at: new Date(Date.now() - 15 * 60_000).toISOString() },
		];

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(summary.changes.find((change) => change.providerId === "vercel")).toMatchObject({ added: ["model-a", "model-b"] });
	});

	it("baselines a provider whose recent success listed models that were never stored", async () => {
		// For example a sweep whose notification failed recorded the check but did not persist its rows.
		supabase.tables.model_discovery_provider_status = [
			{ provider_id: "vercel", provider_name: "Vercel AI Gateway", status: "ok", model_count: 2, consecutive_failures: 0, last_success_at: new Date(Date.now() - 15 * 60_000).toISOString() },
		];

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(summary.changes).toEqual([]);
	});

	it("re-baselines quietly after an outage longer than the retention window", async () => {
		supabase.tables.model_discovery_provider_status = [
			{ provider_id: "vercel", provider_name: "Vercel AI Gateway", status: "error", model_count: null, consecutive_failures: 900, last_success_at: new Date(Date.now() - 9 * 24 * 3600_000).toISOString() },
		];

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(summary.changes).toEqual([]);
	});

	it("records every provider's check outcome in one status upsert", async () => {
		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		const statusRows = writes("model_discovery_provider_status", "upsert")
			.flatMap((call) => call.args[0] as Array<{ provider_id: string; status: string; model_count: number | null }>);
		expect(statusRows).toHaveLength(summary.providersTotal);
		expect(statusRows.find((row) => row.provider_id === "vercel")).toMatchObject({ status: "ok", model_count: 2 });
		expect(statusRows.find((row) => row.provider_id === "openai")).toMatchObject({ status: "skipped", model_count: null });
		expect(summary.providerHealth).toMatchObject({ checked: summary.providersTotal, alertsSent: 0 });
	});

	it("defers writing first-check providers when their status cannot be read", async () => {
		supabase.failingReads.add("model_discovery_provider_status");
		supabase.tables.model_discovery_seen_models = [{ provider_id: "vercel", model_id: "model-a", watch_snapshot: null, removal_pending: false }];

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		// Providers with stored rows still diff normally; the rest neither report nor persist anything.
		expect(summary.changes.map((change) => change.providerId)).toEqual(["vercel"]);
		expect([...new Set(upsertedSeenRows().map((row) => row.provider_id))]).toEqual(["vercel"]);
	});

	it("writes no seen-model rows when a second sweep finds nothing changed", async () => {
		const first = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });
		// Store what the first sweep wrote, as Postgres would hand it back.
		supabase.tables.model_discovery_seen_models = JSON.parse(JSON.stringify(upsertedSeenRows()));
		supabase.calls = [];

		const second = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(first.seenModels.written).toBeGreaterThan(10);
		expect(upsertedSeenRows()).toEqual([]);
		expect(second.seenModels).toEqual({ written: 0, unchanged: first.seenModels.written });
	});

	it("rewrites only rows due their daily last_seen_at refresh", async () => {
		await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });
		const stored = JSON.parse(JSON.stringify(upsertedSeenRows())) as Array<{ provider_id: string; last_seen_at: string }>;
		const dayAgo = new Date(Date.now() - 25 * 3600_000).toISOString();
		supabase.tables.model_discovery_seen_models = stored.map((row) => row.provider_id === "vercel" ? { ...row, last_seen_at: dayAgo } : row);
		supabase.calls = [];

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(upsertedSeenRows().map((row) => `${row.provider_id}/${row.model_id}`)).toEqual(["vercel/model-a", "vercel/model-b"]);
		expect(summary.seenModels.written).toBe(2);
	});

	it("fetches a /models list once when two provider entries share its URL and key", async () => {
		supabase.bindings = { ...supabase.bindings, VENICE_API_KEY: "venice-key" };

		const summary = await runModelDiscoveryJob({ trigger: "manual", source: "test", notify: false, prune: false });

		expect(fetchMock.calls.filter((call) => call.url === "https://api.venice.ai/api/v1/models")).toHaveLength(1);
		expect(summary.results.filter((result) => result.providerId.startsWith("venice")).map((result) => [result.providerId, result.status]))
			.toEqual([["venice", "success"], ["venice-e2ee", "success"]]);
	});
});
