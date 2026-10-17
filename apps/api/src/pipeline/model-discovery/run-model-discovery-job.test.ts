import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";

type Call = { table: string; op: string; args: unknown[] };

const supabase = vi.hoisted(() => ({ tables: {} as Record<string, unknown[]>, calls: [] as Array<{ table: string; op: string; args: unknown[] }> }));

vi.mock("@/runtime/env", () => {
	const WRITE_OPS = new Set(["insert", "upsert", "update", "delete"]);
	// Chainable PostgREST stand-in: records every write and answers reads from `supabase.tables`.
	const from = (table: string) => {
		let op = "select";
		const builder: Record<string, unknown> = new Proxy({}, {
			get(_target, prop: string) {
				if (prop === "then") {
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
		getBindings: () => ({ PRICING_PAGE_MONITOR_ENABLED: "false" }),
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
});
