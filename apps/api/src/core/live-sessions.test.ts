import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_PRICE_CARD, LIVE_SEARCH_PRICE_CARD, assertLiveFinalUsage, createLiveConfig, ingestLiveUsage, liveStartEvent, priceLiveUsage, type LiveConfig } from "./live-sessions";
import { liveBackendSettingsSchema } from "./live-settings";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import { createLiveSessionSchema, createRealtimeSessionSchema } from "@/routes/v1/data/realtime-sessions";

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn(async () => null) }));

const config: LiveConfig = { backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_PRICE_CARD,
	backendCard: { ...LIVE_PRICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules: [
		["input_text_tokens", "1"], ["cached_read_text_tokens", "0.1"], ["cached_write_text_tokens", "1.25"], ["output_text_tokens", "10"],
	].map(([meter, price]) => ({ ...LIVE_PRICE_CARD.rules[0], meter: meter as any, unit: "token", unit_size: 1_000_000, price_per_unit: price })) } };
const terminal = (type = "response.completed", id = "resp_1") => ({ type: "response.event", event: { type, response: {
	id, usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 500,
		output_tokens_details: { reasoning_tokens: 200 } },
} } });

function relay() {
	const storage = new Map<string, any>();
	const object = new RealtimeRelayDurableObject({ waitUntil: vi.fn(), storage: {
		put: vi.fn(async (key: string | Record<string, any>, value: any) => {
			if (typeof key === "string") storage.set(key, structuredClone(value));
			else for (const [k, v] of Object.entries(key)) storage.set(k, structuredClone(v));
		}), get: vi.fn(async (key: string) => storage.get(key)), setAlarm: vi.fn(),
	} } as any, {} as any) as any;
	object.session = { session_id: "rt_test", provider: "openai", model_id: "openai/gpt-live-1", metadata: { live: config } };
	object.upstream = { readyState: 1, bufferedAmount: 0 };
	object.providerSetupComplete = true;
	object.usage = { live_started: true };
	object.sendClientRaw = vi.fn(); object.sendClient = vi.fn(); object.sendUpstream = vi.fn();
	object.persistUsage = vi.fn(); object.resetIdleTimer = vi.fn(); object.markBillingUnresolved = vi.fn(async () => true);
	return { object, storage };
}

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("Live billing", () => {
	it("replaces cumulative seconds and charges every response once, including cached and reasoning tokens", () => {
		let usage = ingestLiveUsage({ live_started: true }, { type: "session.usage.updated", usage: { seconds: 20 } });
		usage = ingestLiveUsage(usage, terminal());
		usage = ingestLiveUsage(usage, terminal());
		usage = ingestLiveUsage(usage, terminal("response.incomplete", "resp_2"));
		usage = ingestLiveUsage(usage, { type: "session.closed", usage: { seconds: 60 } });
		expect(() => assertLiveFinalUsage(usage)).not.toThrow();
		const bill = priceLiveUsage(usage, config) as any;
		expect(bill.live_voice_nanos).toBe(50_000_000);
		expect(bill.live_backend_nanos).toBe(11_280_000);
		expect(bill.pricing.total_nanos).toBe(61_280_000);
		expect(bill.pricing.lines.filter((line: any) => line.component === "backend")).toHaveLength(6);
	});
	it("preserves per-second precision and has no WebRTC initialization charge on WebSockets", () => {
		expect((priceLiveUsage({ live_seconds: 45.8 }, config).pricing as any).total_nanos).toBe(38_166_667);
		expect((priceLiveUsage({ live_seconds: 0 }, config).pricing as any).total_nanos).toBe(0);
	});
	it("prices cache writes separately from uncached input without double billing", () => {
		const event = terminal();
		(event.event.response.usage.input_tokens_details as any).cache_write_tokens = 200;
		const usage = ingestLiveUsage({}, event);
		expect(usage.live_responses?.[0].usage).toMatchObject({ input_text_tokens: 400, cached_read_text_tokens: 400, cached_write_text_tokens: 200 });
		expect(priceLiveUsage(usage, config).live_backend_nanos).toBe(5_690_000);
	});
	it("retains the hold when final voice or backend usage is missing", () => {
		expect(() => assertLiveFinalUsage({ live_started: true, live_final: true, live_seconds: 20, live_billing_error: "missing_backend_usage" })).toThrow("authoritative_usage_invalid");
		expect(() => assertLiveFinalUsage({ live_started: true, live_seconds: 20 })).toThrow("authoritative_usage_pending");
		let usage = ingestLiveUsage({ live_started: true }, { type: "session.delegation.created", delegation: { id: "del_1", target: "responses", response_id: "resp_1" } });
		usage = ingestLiveUsage(usage, { type: "session.closed", usage: { seconds: 20 } });
		expect(() => assertLiveFinalUsage(usage)).toThrow("live_response_authoritative_usage_pending");
		expect(() => assertLiveFinalUsage(ingestLiveUsage(usage, terminal()))).not.toThrow();
	});
	it.each(["response.failed", "response.incomplete", "response.cancelled"])("bills partial usage on %s", (type) => {
		expect(priceLiveUsage(ingestLiveUsage({}, terminal(type)), config).live_backend_nanos).toBe(5_640_000);
	});
	it("fails closed for malformed or regressed usage and missing backend prices", async () => {
		expect(() => ingestLiveUsage({}, { type: "session.closed", usage: {} })).toThrow("usage_invalid");
		expect(() => ingestLiveUsage({ live_seconds: 10 }, { type: "session.closed", usage: { seconds: 9 } })).toThrow("usage_regressed");
		expect(() => ingestLiveUsage({}, { type: "response.event", event: { type: "response.failed", response: { id: "r", usage: null } } })).toThrow("authoritative_usage_missing");
		await expect(createLiveConfig(config.backendModel)).rejects.toThrow("price_card_missing");
	});
	it("configures only the selected backend, bounded output, standard tier and no unmetered tools", () => {
		expect(liveStartEvent(config, "marin").session).toMatchObject({ model: "gpt-live-1",
			audio: { format: { type: "audio/pcm", rate: 24000 } }, delegation: { type: "responses",
				responses: { model: "gpt-5.6-luna", max_output_tokens: 4096, service_tier: "default", tools: [] } } });
	});
	it("rejects API source, arbitrary backends, tools and client price overrides", () => {
		const request = { model: "openai/gpt-live-1", provider: "openai", source: "chat" };
		expect(createLiveSessionSchema.safeParse(request).success).toBe(true);
		for (const extra of [{ source: "api" }, { backend_model: "openai/expensive" }, { tools: [] }, { voice: "invalid" }, { final_cost_nanos: 0 }]) {
			expect(createLiveSessionSchema.safeParse({ ...request, ...extra }).success).toBe(false);
		}
		expect(createRealtimeSessionSchema.safeParse({ ...request, backend_model: config.backendModel }).success).toBe(false);
	});
});

describe("Live relay finalization", () => {
	it.each([false, true])("marks invalid usage unresolved without close recursion (started: %s)", async (started) => {
		const { object } = relay();
		object.usage = { live_started: started, live_final: started, live_seconds: 5, live_billing_error: "conflicting_usage" };
		await object.settle("failed", "provider_event_processing_failed");
		expect(object.markBillingUnresolved).toHaveBeenCalledExactlyOnceWith("live_authoritative_usage_pending");
		expect(object.sendUpstream).not.toHaveBeenCalled();
	});
	it("waits for the final streamed tool item instead of settling at the response terminal", async () => {
		const { object } = relay(); object.settle = vi.fn();
		object.session.metadata.live = { ...config, settings: liveBackendSettingsSchema.parse({ web_search: true }), searchCard: LIVE_SEARCH_PRICE_CARD };
		await object.handleUpstreamMessage(JSON.stringify({ type: "session.delegation.created", delegation: { id: "d", target: "responses", response_id: "resp_1" } }));
		const toolEvent = { type: "response.event", delegation_id: "d", event: { type: "response.output_item.added", item: { type: "web_search_call", id: "s" } } };
		await object.handleUpstreamMessage(JSON.stringify(toolEvent));
		await object.handleUpstreamMessage(JSON.stringify(terminal()));
		await object.handleUpstreamMessage(JSON.stringify({ type: "session.closed", usage: { seconds: 10 } }));
		expect(object.settle).not.toHaveBeenCalled();
		toolEvent.event.type = "response.output_item.done";
		await object.handleUpstreamMessage(JSON.stringify(toolEvent));
		expect(object.settle).toHaveBeenCalledTimes(1);
		expect(object.sendClient).toHaveBeenLastCalledWith(expect.objectContaining({ type: "relay.live_usage", tool_nanos: 10_000_000,
			usage: expect.objectContaining({ native_web_search_requests: 1 }) }));
	});
	it("sends session.close on disconnect and leaves the upstream open for final usage", async () => {
		vi.useFakeTimers(); const { object, storage } = relay();
		await object.handleClientGone();
		expect(object.sendUpstream).toHaveBeenCalledExactlyOnceWith({ type: "session.close" });
		expect(object.upstream).not.toBeNull();
		expect(storage.get("pending_settlement").phase).toBe("authoritative");
		await object.handleClientGone();
		expect(object.sendUpstream).toHaveBeenCalledTimes(1);
	});
	it("checkpoints response IDs together with usage, survives reloading, then settles only after session.closed", async () => {
		const { object, storage } = relay(); object.settle = vi.fn();
		await object.handleUpstreamMessage(JSON.stringify(terminal()));
		object.usage = storage.get("usage");
		await object.handleUpstreamMessage(JSON.stringify(terminal()));
		expect(object.usage.live_responses).toHaveLength(1);
		expect(object.settle).not.toHaveBeenCalled();
		await object.handleUpstreamMessage(JSON.stringify({ type: "session.closed", usage: { seconds: 45.8 } }));
		expect(object.settle).toHaveBeenCalledWith("completed", "live_session_closed");
	});
	it("marks an abruptly closed upstream unresolved instead of releasing credits", async () => {
		const { object } = relay(); object.upstream = null;
		await object.settle("failed", "provider_closed");
		expect(object.markBillingUnresolved).toHaveBeenCalledWith("live_authoritative_usage_pending");
	});
	it("does not let a later final event erase missing backend billing", async () => {
		vi.useFakeTimers(); const { object } = relay();
		object.queueUpstreamEvent(() => object.handleUpstreamMessage(JSON.stringify({ type: "response.event", event: {
			type: "response.failed", response: { id: "unknown", usage: null },
		} })));
		await object.upstreamEvents;
		expect(object.usage.live_billing_error).toBe("provider_event_processing_failed");
		await object.handleUpstreamMessage(JSON.stringify({ type: "session.closed", usage: { seconds: 30 } }));
		expect(object.markBillingUnresolved).toHaveBeenCalled();
	});
	it("times out missing final usage into billing review", async () => {
		vi.useFakeTimers(); const { object } = relay();
		await object.handleClientGone();
		await vi.advanceTimersByTimeAsync(20_001);
		await object.upstreamEvents;
		expect(object.markBillingUnresolved).toHaveBeenCalled();
	});
	it("maps microphone PCM to Live audio without Realtime commit events or trusting client usage", async () => {
		const { object } = relay();
		const audio = Buffer.alloc(4800).toString("base64");
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio }));
		expect(object.sendUpstream).toHaveBeenCalledExactlyOnceWith({ type: "session.input_audio.append", audio });
		await object.handleClientMessage(JSON.stringify({ type: "session.closed", usage: { seconds: 0 } }));
		expect(object.usage.live_final).toBeUndefined();
	});
});
