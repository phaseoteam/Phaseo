import { expect, it, vi } from "vitest";
import { runRealtimeSessionReconciliationJob } from "./realtime-sessions";

const state = vi.hoisted(() => ({ rows: [] as any[], filters: [] as string[], rpc: vi.fn() }));
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
