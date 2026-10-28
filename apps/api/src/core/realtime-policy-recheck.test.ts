import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceCard, PriceRule } from "@pipeline/pricing/types";
import { extendRealtimeSessionHold, publicRealtimeSessionPayload, updateRealtimeSessionUsage } from "./realtime-sessions";

const card: PriceCard = {
	provider: "openai",
	model: "openai/gpt-realtime-2",
	endpoint: "audio.realtime",
	effective_from: null,
	effective_to: null,
	currency: "USD",
	version: null,
	rules: [{ pricing_plan: "standard", currency: "USD", match: [], priority: 100, meter: "output_audio_tokens",
		unit: "token", unit_size: 1_000_000, price_per_unit: "64" } as PriceRule],
};

const state = vi.hoisted(() => ({
	session: {} as Record<string, any>,
	key: null as Record<string, any> | null,
	workspace: { id: "workspace" } as Record<string, any> | null,
	keyLimit: { ok: true, buckets: {} } as Record<string, any>,
	updates: [] as Array<Record<string, any>>,
	rpc: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({
		rpc: state.rpc,
		from: (table: string) => {
			let payload: Record<string, any> | null = null;
			const result = () => {
				if (table === "keys") return state.key;
				if (table === "workspaces") return state.workspace;
				if (payload) {
					state.updates.push(payload);
					return { ...state.session, ...payload };
				}
				return state.session;
			};
			const query: any = {
				update: (value: Record<string, any>) => { payload = value; return query; },
				maybeSingle: async () => ({ data: result(), error: null }),
				single: async () => ({ data: result(), error: null }),
			};
			for (const method of ["select", "eq", "in"]) query[method] = () => query;
			return query;
		},
	}),
}));
vi.mock("./realtime-billing-review", () => ({
	quoteRealtimeRecovery: vi.fn(),
	refreshRealtimeBillingReviews: vi.fn(),
	syncRealtimeBillingReviewSummaries: vi.fn(),
}));
vi.mock("@core/workspace-usage-rollups", () => ({ syncWorkspaceUsageRollupForRequest: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn(async () => card) }));
vi.mock("@pipeline/before/context", () => ({
	fetchGatewayContext: vi.fn(async () => ({ key: { ok: true }, keyLimit: state.keyLimit, teamSettings: null, resolvedModel: null })),
}));
vi.mock("@pipeline/before/utils", () => ({
	buildProviderCandidatesWithDiagnostics: vi.fn(() => ({ candidates: [{ providerId: "openai" }] })),
}));
vi.mock("@pipeline/before/workspacePolicy", () => ({
	fetchWorkspacePolicy: vi.fn(async () => ({})),
	applyWorkspacePolicy: vi.fn((args: { providers: unknown[] }) => ({ ok: true, providers: args.providers })),
}));

const auth = { requestId: "req", workspaceId: "workspace", apiKeyId: "key", internal: true };

function session(source: "api" | "chat") {
	return {
		session_id: "rt_policy",
		workspace_id: "workspace",
		key_id: "key",
		source,
		provider: "openai",
		model_id: "openai/gpt-realtime-2",
		status: "connected",
		reserved_nanos: 5_000_000_000,
		estimated_cost_nanos: 0,
		reservation_prefix: "rt:rt_policy:",
		usage: {},
		metadata: {},
		started_at: "2026-10-22T10:00:00.000Z",
		expires_at: "2026-10-22T11:00:00.000Z",
	};
}

const costLimitReached = { ok: true, buckets: { daily: { costLimitNanos: 1_000_000, costUsedNanos: 2_000_000 } } };

beforeEach(() => {
	state.key = { status: "active", soft_blocked: false, expires_at: null, revoked_at: null };
	state.workspace = { id: "workspace" };
	state.keyLimit = { ok: true, buckets: {} };
	state.updates.length = 0;
	state.rpc.mockReset();
});

describe("active realtime policy recheck", () => {
	it("only warns about a key spend limit on an API call", async () => {
		state.session = session("api");
		state.keyLimit = costLimitReached;
		const updated = await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: { output_audio_tokens: 100 } });
		expect(state.updates[0].status).toBeUndefined();
		expect(updated.status).toBe("connected");
		expect(updated.policy_warnings).toEqual(["realtime_key_cost_limit_reached"]);
	});

	it("still ends a playground call at a key spend limit", async () => {
		state.session = session("chat");
		state.keyLimit = costLimitReached;
		const updated = await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: { output_audio_tokens: 100 } });
		expect(state.updates[0]).toMatchObject({ status: "ending", disconnect_reason: "realtime_key_cost_limit_reached" });
		expect(updated.policy_warnings).toBeUndefined();
	});

	it.each([
		[{ status: "revoked", revoked_at: "2026-10-22T10:05:00Z" }, "realtime_key_revoked"],
		[{ soft_blocked: true }, "realtime_key_blocked"],
		[{ status: "paused" }, "realtime_key_blocked"],
		[{ status: "disabled" }, "realtime_key_revoked"],
		[{ expires_at: "2026-01-01T00:00:00Z" }, "realtime_key_expired"],
	])("ends an API call when the key changes to %o", async (change, reason) => {
		state.session = session("api");
		state.key = { ...state.key, ...change };
		await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: {} });
		expect(state.updates[0]).toMatchObject({ status: "ending", disconnect_reason: reason });
	});

	it("ends an API call when the key or its workspace is deleted", async () => {
		state.session = session("api");
		state.key = null;
		await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: {} });
		expect(state.updates[0]).toMatchObject({ status: "ending", disconnect_reason: "realtime_key_revoked" });
		state.updates.length = 0;
		state.workspace = null;
		await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: {} });
		expect(state.updates[0]).toMatchObject({ status: "ending", disconnect_reason: "realtime_workspace_disabled" });
	});

	it.each(["api", "chat"] as const)("returns a %s call's policy block as a warning so the relay can give notice", async (source) => {
		const { applyWorkspacePolicy } = await import("@pipeline/before/workspacePolicy");
		state.session = session(source);
		vi.mocked(applyWorkspacePolicy).mockReturnValueOnce({ ok: false } as any);
		const blocked = await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: {} });
		expect(state.updates[0].status).toBeUndefined();
		expect(blocked.policy_warnings).toEqual(["realtime_workspace_policy_blocked"]);
		vi.mocked(applyWorkspacePolicy).mockReturnValueOnce({ ok: true, providers: [] } as any);
		const removed = await updateRealtimeSessionUsage({ auth, sessionId: "rt_policy", usage: {} });
		expect(removed.policy_warnings).toEqual(["realtime_provider_not_available"]);
	});

	it("still extends an API call's hold past a key spend limit", async () => {
		state.session = session("api");
		state.keyLimit = costLimitReached;
		state.rpc.mockResolvedValueOnce({ data: [{ ...state.session, reserved_nanos: 10_000_000_000 }], error: null });
		const extended = await extendRealtimeSessionHold({ auth, sessionId: "rt_policy", targetReservedNanos: 10_000_000_000 });
		expect(extended.reserved_nanos).toBe(10_000_000_000);
	});

	it("refuses to extend a playground hold past a key spend limit or any hold for a revoked key", async () => {
		state.session = session("chat");
		state.keyLimit = costLimitReached;
		await expect(extendRealtimeSessionHold({ auth, sessionId: "rt_policy" })).rejects.toThrow("realtime_key_cost_limit_reached");
		state.session = session("api");
		state.keyLimit = { ok: true, buckets: {} };
		state.key = { ...state.key, status: "revoked" };
		await expect(extendRealtimeSessionHold({ auth, sessionId: "rt_policy" })).rejects.toThrow("realtime_key_revoked");
		expect(state.rpc).not.toHaveBeenCalled();
	});

	it("publishes the provider cap and the idle timeout only for playground sessions", () => {
		expect(publicRealtimeSessionPayload({ session: session("api") as any })).toMatchObject({
			max_duration_seconds: 3600,
			idle_timeout_seconds: null,
			billing: { maxDurationSeconds: 3600, idleTimeoutSeconds: null, maxOverdraftUsd: 1 },
		});
		expect(publicRealtimeSessionPayload({ session: session("chat") as any })).toMatchObject({
			idle_timeout_seconds: 300,
		});
	});
});
