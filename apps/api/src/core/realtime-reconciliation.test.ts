import { expect, it, vi } from "vitest";
import { runRealtimeSessionReconciliationJob } from "./realtime-sessions";

const state = vi.hoisted(() => ({ rows: [] as any[], filters: [] as string[], updates: [] as any[], rpc: vi.fn() }));
vi.mock("./realtime-billing-review", () => ({
	quoteRealtimeRecovery: vi.fn(),
	refreshRealtimeBillingReviews: vi.fn(async () => 0),
	syncRealtimeBillingReviewSummaries: vi.fn(async () => ({ synced: 0, failed: 0 })),
}));
vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ GATEWAY_CONTROL_SECRET: "test-secret" }),
	getSupabaseAdmin: () => ({
		rpc: state.rpc,
		from: () => {
			const query: any = {
				then: (resolve: any) => resolve({ data: state.rows, count: 0, error: null }),
				or: (filter: string) => { state.filters.push(filter); return query; },
				update: (values: unknown) => { state.updates.push(values); return query; },
			};
			for (const method of ["select", "in", "eq", "lte", "order", "limit"]) query[method] = () => query;
			return query;
		},
	}),
}));

function relayNamespace(result: Record<string, unknown>) {
	const fetch = vi.fn(async () => Response.json(result));
	return { fetch, namespace: { idFromName: (name: string) => name, get: () => ({ fetch }) } as any };
}

it("leaves relays with open sockets and recent traffic alone", async () => {
	state.rows = [{ session_id: "rt_live", workspace_id: "workspace", status: "connected", provider: "openai", model_id: "openai/gpt-realtime", usage: {} }];
	const relay = relayNamespace({ active: true, settled: false, healthy: true });
	const summary = await runRealtimeSessionReconciliationJob({ relay: relay.namespace });
	expect(relay.fetch).toHaveBeenCalledOnce();
	expect(summary).toMatchObject({ sessionsScanned: 1, sessionsHealthy: 1, sessionsErrored: 0, sessionsExpired: 0 });
	expect(state.rpc).not.toHaveBeenCalled();
	// A live call moves to the back of the queue so it can't crowd out dropped ones.
	expect(state.updates.at(-1)).toMatchObject({ last_event_at: expect.any(String), updated_at: expect.any(String) });
});

it("asks a relay after a minute of quiet, but waits five minutes without one", async () => {
	state.rows = [];
	state.filters = [];
	await runRealtimeSessionReconciliationJob({ relay: relayNamespace({ active: false }).namespace });
	await runRealtimeSessionReconciliationJob();
	const quietSeconds = state.filters.map((filter) => {
		const cutoff = /last_event_at\.lte\.([^,]+)/.exec(filter)?.[1];
		return Math.round((Date.now() - Date.parse(cutoff ?? "")) / 1000);
	});
	expect(quietSeconds[0]).toBeGreaterThanOrEqual(59);
	expect(quietSeconds[0]).toBeLessThanOrEqual(61);
	expect(quietSeconds[1]).toBeGreaterThanOrEqual(299);
});

it("never reaps a quiet API session for idleness, but still reaps a quiet playground session", async () => {
	const stale = new Date(Date.now() - 30 * 60_000).toISOString();
	const future = new Date(Date.now() + 30 * 60_000).toISOString();
	const row = { workspace_id: "workspace", status: "connected", provider: "openai", model_id: "openai/gpt-realtime",
		usage: {}, metadata: { relay: true }, last_event_at: stale, expires_at: future };
	state.rows = [{ ...row, session_id: "rt_api", source: "api" }];
	state.rpc.mockReset();
	const api = await runRealtimeSessionReconciliationJob();
	expect(api).toMatchObject({ sessionsHealthy: 1, sessionsErrored: 0, sessionsExpired: 0 });
	expect(state.rpc).not.toHaveBeenCalled();

	state.rows = [{ ...row, session_id: "rt_chat", source: "chat" }];
	state.rpc.mockResolvedValue({ data: [{ session_id: "rt_chat", status: "billing_unresolved" }], error: null });
	const chat = await runRealtimeSessionReconciliationJob();
	expect(chat.sessionsHealthy).toBe(0);
	expect(state.rpc).toHaveBeenCalledWith("gateway_realtime_mark_billing_unresolved", expect.anything());
});

it("selects sessions whose relay was never claimed after two minutes", async () => {
	state.rows = [];
	state.filters.length = 0;
	const before = Date.now();
	await runRealtimeSessionReconciliationJob();
	const filter = state.filters[0];
	const match = filter.match(/and\(status\.eq\.created,created_at\.lte\.([^)]+)\)/);
	expect(match).not.toBeNull();
	const cutoff = Date.parse(match![1]);
	expect(before - cutoff).toBeGreaterThanOrEqual(119_000);
	expect(before - cutoff).toBeLessThan(125_000);
});
