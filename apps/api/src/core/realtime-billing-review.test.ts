import { expect, it, vi } from "vitest";
import { quoteRealtimeRecovery, refreshRealtimeBillingReviews, syncRealtimeBillingReviewSummaries } from "./realtime-billing-review";
import { ingestLiveUsage, LIVE_PRICE_CARD, LIVE_SEARCH_PRICE_CARD, type LiveUsage } from "./live-sessions";
const mocks = vi.hoisted(() => ({ db: null as any }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => mocks.db }));
const metadata = { live: { backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_PRICE_CARD,
	settings: { web_search: true }, searchCard: LIVE_SEARCH_PRICE_CARD,
	backendCard: { ...LIVE_PRICE_CARD, endpoint: "text.generate", rules: [
		["input_text_tokens", "1"], ["output_text_tokens", "2"], ["cached_read_text_tokens", "0.1"], ["cached_write_text_tokens", "1"],
	].map(([meter, price]) => ({ ...LIVE_PRICE_CARD.rules[0], meter, unit_size: 1e6, price_per_unit: price })) } } };
const quote = (usage: LiveUsage) => quoteRealtimeRecovery("openai/gpt-live-1", usage, metadata);
const completed = () => ingestLiveUsage({ live_started: true, live_seconds: 9 }, { type: "response.event", delegation_id: "del_1",
	event: { type: "response.completed", response: { id: "resp_1", model: "gpt-5.6-luna", service_tier: "default",
		usage: { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 50 }, output_tokens_details: { reasoning_tokens: 10 } } } } });

it("quotes seconds precisely as a lower bound without inventing final usage", () => {
	expect(quote({ live_started: true, live_seconds: 9 })).toMatchObject({ costNanos: 7500000, complete: false });
	expect(quote({ live_started: true, live_seconds: 1 })).toMatchObject({ costNanos: 833333, complete: false });
	expect(quote({ live_started: true, live_seconds: 45.8 })).toMatchObject({ costNanos: 38166667 });
	expect(quote({ live_started: true })).toMatchObject({ costNanos: 0, complete: false });
});
it("requires explicit non-start or complete provider evidence for finality", () => {
	expect(() => quote({})).toThrow("start_evidence_missing");
	expect(quote({ live_started: false })).toMatchObject({ costNanos: 0, complete: true });
	expect(quote({ live_started: true, live_seconds: 9, live_final: true })).toMatchObject({ complete: true });
	expect(quote({ live_started: true, live_seconds: 9, live_final: true, live_pending_responses: ["resp_1"] })).toMatchObject({ complete: false });
});
it("uses raw provider cache/output evidence without double billing reasoning", () => {
	expect(quote(completed())).toMatchObject({ costNanos: 7595000, complete: false });
	const usage = completed(); usage.live_responses![0].usage.output_text_tokens = 999;
	expect(() => quote(usage)).toThrow("response_evidence_invalid");
});
it("includes completed search calls, excluding unknown pending tool cost", () => {
	const usage = completed(); usage.live_tool_calls = [
		{ id: "tool_done", response_id: "resp_1", delegation_id: "del_1", done: true },
		{ id: "tool_pending", response_id: "resp_1", delegation_id: "del_1", done: false },
	];
	expect(quote(usage)).toMatchObject({ costNanos: 17595000, complete: false });
	expect(quote(usage).billableUsage.native_web_search_requests).toBe(1);
});
it("fails closed on conflicts, duplicates and invalid counters", () => {
	expect(() => quote({ live_started: true, live_billing_error: "conflict" })).toThrow("conflicting_evidence");
	for (const seconds of [-1, Infinity, NaN]) expect(() => quote({ live_started: true, live_seconds: seconds })).toThrow("seconds_invalid");
	const usage = completed(); usage.live_responses!.push(usage.live_responses![0]);
	expect(() => quote(usage)).toThrow("response_evidence_invalid");
	expect(() => quote({ live_started: false, live_seconds: 1 })).toThrow("start_evidence_conflict");
	expect(() => quoteRealtimeRecovery("openai/gpt-realtime", {}, {})).toThrow("provider_not_supported");
});
it("refresh stores evidence with compare-and-swap; incomplete evidence is not captured and no provider is called", async () => {
	const fetchMock = vi.spyOn(globalThis, "fetch");
	const rpc = vi.fn(async () => ({ data: true, error: null }));
	const query: any = { then: (resolve: any) => resolve({ data: [{ session_id: "rt_test" }], error: null }),
		single: async () => ({ data: { session_id: "rt_test", model_id: "openai/gpt-live-1", status: "billing_unresolved", usage: completed(), metadata }, error: null }) };
	for (const method of ["select", "eq", "lte", "order", "limit"]) query[method] = () => query;
	mocks.db = { from: () => query, rpc };
	try {
		expect(await refreshRealtimeBillingReviews()).toBe(1);
		expect(rpc).toHaveBeenCalledOnce(); expect(rpc.mock.calls[0]).toMatchObject(["gateway_realtime_review_evidence", { p_cost_nanos: 7595000, p_complete: false, p_expected_usage: completed() }]);
		expect(fetchMock).not.toHaveBeenCalled();
	} finally { fetchMock.mockRestore(); }
});

it("retries derived reports after failure and only acknowledges a successful sync", async () => {
	const rpc = vi.fn().mockResolvedValueOnce({ error: { message: "temporary failure" } }).mockResolvedValue({ error: null });
	const query: any = { then: (resolve: any) => resolve({ data: [{ session_id: "rt_test", workspace_id: "workspace",
		session: { started_at: "2026-09-11T10:00:00Z" } }], error: null }),
		single: async () => ({ data: { id: "request_1", created_at: "2026-09-11T10:00:00Z" }, error: null }) };
	for (const method of ["select", "eq", "is", "order", "limit"]) query[method] = () => query;
	mocks.db = { from: () => query, rpc };
	// A failed item is logged and left unacknowledged; the loop does not throw.
	await expect(syncRealtimeBillingReviewSummaries()).resolves.toEqual({ synced: 0, failed: 1 });
	expect(rpc).toHaveBeenCalledTimes(1);
	await expect(syncRealtimeBillingReviewSummaries()).resolves.toEqual({ synced: 1, failed: 0 });
	expect(rpc).toHaveBeenLastCalledWith("gateway_realtime_review_summary_synced", { p_session_id: "rt_test" });
});

it("keeps refreshing later reviews when one review fails", async () => {
	const rpc = vi.fn(async () => ({ data: true, error: null }));
	let reads = 0;
	const query: any = { then: (resolve: any) => resolve({ data: [{ session_id: "rt_bad" }, { session_id: "rt_good" }], error: null }),
		single: async () => (++reads === 1
			? { data: null, error: { message: "read failed" } }
			: { data: { session_id: "rt_good", model_id: "openai/gpt-live-1", status: "billing_unresolved", usage: completed(), metadata }, error: null }) };
	for (const method of ["select", "eq", "lte", "order", "limit"]) query[method] = () => query;
	mocks.db = { from: () => query, rpc };
	const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
	try {
		expect(await refreshRealtimeBillingReviews()).toBe(2);
		expect(rpc).toHaveBeenCalledOnce();
		expect(rpc.mock.calls[0]).toMatchObject(["gateway_realtime_review_evidence", { p_session_id: "rt_good" }]);
	} finally { error.mockRestore(); }
});

it("settles a review whose evidence is complete, and leaves the rest to an admin", async () => {
	const usage = { input_audio_tokens: 400, output_audio_tokens: 900 };
	const session = { session_id: "rt_openai", workspace_id: "workspace", model_id: "openai/gpt-realtime-2.1", provider: "openai",
		status: "billing_unresolved", usage, metadata: {} };
	const run = async (quoted: { complete: boolean }, evidenceStored = true) => {
		const rpc = vi.fn(async (name: string) => ({ data: name === "gateway_realtime_review_evidence" ? evidenceStored : [{ applied: true }], error: null }));
		const query: any = { then: (resolve: any) => resolve({ data: [{ session_id: "rt_openai" }], error: null }),
			single: async () => ({ data: session, error: null }) };
		for (const method of ["select", "eq", "lte", "order", "limit"]) query[method] = () => query;
		mocks.db = { from: () => query, rpc };
		const quoteOther = vi.fn(async () => ({ costNanos: 12_000_000, lines: [{ meter: "output_audio_tokens" }], billableUsage: usage, ...quoted }));
		await refreshRealtimeBillingReviews(25, quoteOther);
		expect(quoteOther).toHaveBeenCalledWith(session);
		return rpc.mock.calls.map((call) => call as unknown[]);
	};

	const complete = await run({ complete: true });
	expect(complete.map(([name]) => name)).toEqual(["gateway_realtime_review_evidence", "gateway_realtime_settle_once"]);
	expect(complete[1][1]).toMatchObject({ p_session_id: "rt_openai", p_final_cost_nanos: 12_000_000, p_usage: usage,
		p_status: "completed", p_disconnect_reason: "billing_review_auto_capture" });

	expect((await run({ complete: false })).map(([name]) => name)).toEqual(["gateway_realtime_review_evidence"]);
	// The usage changed after it was quoted: the stale quote is not charged.
	expect((await run({ complete: true }, false)).map(([name]) => name)).toEqual(["gateway_realtime_review_evidence"]);
});
