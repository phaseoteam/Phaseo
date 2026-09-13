import { beforeEach, expect, it, vi } from "vitest";
import { settleRealtimeSession } from "./realtime-sessions";
import { LIVE_PRICE_CARD, LIVE_SEARCH_PRICE_CARD, ingestLiveUsage } from "./live-sessions";
import { liveBackendSettingsSchema } from "./live-settings";

const state = vi.hoisted(() => ({ row: {} as any, rpc: vi.fn(), rollup: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@core/workspace-usage-rollups", () => ({ syncWorkspaceUsageRollupForRequest: state.rollup }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ rpc: state.rpc, from: (table: string) => {
	const query: any = { select: () => query, eq: () => query,
		maybeSingle: async () => ({ data: structuredClone(state.row), error: null }),
		single: async () => ({ data: table === "gateway_requests" ? { id: "request", created_at: "2026-09-10" } : structuredClone(state.row), error: null }) };
	return query;
} }) }));

const auth = { requestId: "test", workspaceId: "workspace", apiKeyId: "key", internal: true };
beforeEach(() => {
	vi.clearAllMocks();
	state.row = { session_id: "rt_test", key_id: "key", workspace_id: "workspace", status: "connected",
		model_id: "openai/gpt-live-1", provider: "openai", started_at: "2026-09-10", reserved_nanos: 5e9,
		metadata: { live: { backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_PRICE_CARD,
			backendCard: { ...LIVE_PRICE_CARD, endpoint: "text.generate", rules: [
				{ ...LIVE_PRICE_CARD.rules[0], meter: "input_text_tokens", unit_size: 1e6, price_per_unit: "1" },
				{ ...LIVE_PRICE_CARD.rules[0], meter: "cached_read_text_tokens", unit_size: 1e6, price_per_unit: "0.1" },
				{ ...LIVE_PRICE_CARD.rules[0], meter: "output_text_tokens", unit_size: 1e6, price_per_unit: "10" },
			] } } } };
	state.rpc.mockImplementation(async (name, args) => {
		expect(name).toBe("gateway_realtime_settle_once");
		Object.assign(state.row, { status: args.p_status, final_cost_nanos: args.p_final_cost_nanos,
			captured_nanos: args.p_final_cost_nanos, released_nanos: 5e9 - args.p_final_cost_nanos,
			usage: args.p_usage, pricing_lines: args.p_pricing_lines });
		return { data: { ...state.row, applied: true }, error: null };
	});
});

it("captures voice and backend charges atomically, releases the remainder and does not charge again on retry", async () => {
	let usage = ingestLiveUsage({ live_started: true }, { type: "response.event", event: { type: "response.completed", response: {
		id: "r", usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 500 } },
	} } });
	usage = ingestLiveUsage(usage, { type: "session.closed", usage: { seconds: 60 } });
	await settleRealtimeSession({ auth, sessionId: "rt_test", usage, finalCostNanos: 0 });
	expect(state.row.captured_nanos).toBe(52_550_000);
	expect(state.row.released_nanos).toBe(4_947_450_000);
	expect(state.row.pricing_lines.some((line: any) => line.response_id === "r")).toBe(true);
	expect(state.row.usage).toMatchObject({ audio_seconds: 60, input_tokens: 1000, output_tokens: 200, input_text_tokens: 500, cached_read_text_tokens: 500 });
	const retry = await settleRealtimeSession({ auth, sessionId: "rt_test", usage });
	expect(retry.settlement.already_applied).toBe(true);
	expect(state.rpc).toHaveBeenCalledTimes(1);
});

it("does not invoke wallet settlement when the provider's final usage is absent", async () => {
	await expect(settleRealtimeSession({ auth, sessionId: "rt_test", usage: { live_started: true, live_seconds: 30 } }))
		.rejects.toThrow("authoritative_usage_pending");
	expect(state.rpc).not.toHaveBeenCalled();
});

it("preserves an unsettled session on wallet RPC failure and allows a safe retry", async () => {
	const usage = ingestLiveUsage({ live_started: true }, { type: "session.closed", usage: { seconds: 60 } });
	state.rpc.mockResolvedValueOnce({ data: null, error: { message: "simulated database outage" } });
	await expect(settleRealtimeSession({ auth, sessionId: "rt_test", usage })).rejects.toThrow();
	expect(state.row.final_cost_nanos).toBeUndefined();
	expect(state.row.status).toBe("connected");
	await settleRealtimeSession({ auth, sessionId: "rt_test", usage });
	expect(state.row.captured_nanos).toBe(50_000_000);
	expect(state.row.released_nanos).toBe(4_950_000_000);
	await settleRealtimeSession({ auth, sessionId: "rt_test", usage });
	expect(state.rpc).toHaveBeenCalledTimes(2);
});

it("does not recapture after the wallet commits but its response is lost", async () => {
	const commit = state.rpc.getMockImplementation()!;
	state.rpc.mockImplementationOnce(async (...args) => {
		await commit(...args);
		throw new Error("simulated connection loss after commit");
	});
	const usage = ingestLiveUsage({ live_started: true }, { type: "session.closed", usage: { seconds: 60 } });
	await expect(settleRealtimeSession({ auth, sessionId: "rt_test", usage })).rejects.toThrow();
	expect(state.row.captured_nanos).toBe(50_000_000);
	const retry = await settleRealtimeSession({ auth, sessionId: "rt_test", usage });
	expect(retry.settlement.already_applied).toBe(true);
	expect(state.rpc).toHaveBeenCalledTimes(1);
});

it("rejects browser-supplied settlement even when the session belongs to that user", async () => {
	await expect(settleRealtimeSession({ auth: { ...auth, internal: false }, sessionId: "rt_test", usage: {} }))
		.rejects.toThrow("settlement_internal_only");
	expect(state.rpc).not.toHaveBeenCalled();
});

it("settles web search and delegated tokens together, including usage received after voice closes", async () => {
	Object.assign(state.row.metadata.live, { searchCard: LIVE_SEARCH_PRICE_CARD, settings: liveBackendSettingsSchema.parse({ web_search: true }) });
	let usage = ingestLiveUsage({ live_started: true }, { type: "session.delegation.created", delegation: { id: "d", target: "responses", response_id: "r" } });
	usage = ingestLiveUsage(usage, { type: "session.closed", usage: { seconds: 60 } });
	await expect(settleRealtimeSession({ auth, sessionId: "rt_test", usage })).rejects.toThrow("response_authoritative_usage_pending");
	expect(state.rpc).not.toHaveBeenCalled();
	usage = ingestLiveUsage(usage, { type: "response.event", delegation_id: "d", event: { type: "response.output_item.done", item: { id: "s", type: "web_search_call", status: "completed" } } });
	usage = ingestLiveUsage(usage, { type: "response.event", delegation_id: "d", event: { type: "response.completed", response: {
		id: "r", model: "gpt-5.6-luna", service_tier: "default", output: [],
		usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 500 }, output_tokens_details: { reasoning_tokens: 100 } },
	} } });
	await settleRealtimeSession({ auth, sessionId: "rt_test", usage });
	expect(state.row.captured_nanos).toBe(62_550_000);
	expect(state.row.usage.native_web_search_requests).toBe(1);
	expect(state.row.usage.live_responses[0].provider_usage.output_tokens_details.reasoning_tokens).toBe(100);
	expect(state.row.pricing_lines).toContainEqual(expect.objectContaining({ component: "tool", tool_call_id: "s", line_nanos: 10_000_000 }));
	await settleRealtimeSession({ auth, sessionId: "rt_test", usage });
	expect(state.rpc).toHaveBeenCalledTimes(1);
});
