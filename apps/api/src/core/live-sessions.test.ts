import { afterEach, describe, expect, it, vi } from "vitest";
import { LIVE_SEARCH_PRICE_CARD, assertLiveFinalUsage, createLiveConfig, ingestLiveUsage, liveStartEvent, liveUsageMeters, priceLiveUsage, type LiveConfig, type LiveUsage } from "./live-sessions";
import { LEGACY_LIVE_VOICE_CARD, LIVE_VOICE_CARD } from "./__fixtures__/live-price-cards";
import { loadPriceCard } from "@pipeline/pricing/loader";
import { liveBackendSettingsSchema } from "./live-settings";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import { createLiveSessionSchema, createRealtimeSessionSchema } from "@/routes/v1/data/realtime-sessions";

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn(async () => null) }));

const config: LiveConfig = { backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_VOICE_CARD,
	backendCard: { ...LIVE_VOICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules: [
		["input_text_tokens", "1"], ["cached_read_text_tokens", "0.1"], ["cached_write_text_tokens_30m", "1.25"], ["output_text_tokens", "10"],
	].map(([meter, price]) => ({ ...LIVE_VOICE_CARD.rules[0], meter: meter as any, unit: "token", unit_size: 1_000_000, price_per_unit: price })) } };
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
		expect(usage.live_responses?.[0].usage).toMatchObject({ input_text_tokens: 400, cached_read_text_tokens: 400, cached_write_text_tokens_30m: 200 });
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
		await expect(createLiveConfig("openai/gpt-live-1", config.backendModel)).rejects.toThrow("live_price_card_missing");
	});
	it("configures only the selected backend, bounded output, standard tier and no unmetered tools", () => {
		expect(liveStartEvent(config, "marin").session).toMatchObject({ model: "gpt-live-1",
			audio: { format: { type: "audio/pcm", rate: 24000 } }, delegation: { type: "responses",
				responses: { model: "gpt-5.6-luna", max_output_tokens: 4096, service_tier: "default", tools: [] } } });
	});
	it("rejects arbitrary backends, top-level tools and client price overrides", () => {
		const request = { model: "openai/gpt-live-1", provider: "openai", source: "chat" };
		expect(createLiveSessionSchema.safeParse(request).success).toBe(true);
		expect(createLiveSessionSchema.safeParse({ ...request, source: "api" }).success).toBe(true);
		for (const extra of [{ backend_model: "openai/expensive" }, { tools: [] }, { voice: "invalid" }, { final_cost_nanos: 0 }]) {
			expect(createLiveSessionSchema.safeParse({ ...request, ...extra }).success).toBe(false);
		}
		expect(createRealtimeSessionSchema.safeParse({ ...request, backend_model: config.backendModel }).success).toBe(false);
	});
	it("keeps Live schema parsing compatible with Gemini thinking validation", () => {
		expect(createLiveSessionSchema.safeParse({
			model: "openai/gpt-live-1",
			provider: "openai",
			source: "chat",
		}).success).toBe(true);
		expect(createRealtimeSessionSchema.safeParse({
			model: "google/gemini-3.8-live-extended-thinking",
			provider: "google-ai-studio",
			thinking_level: "high",
		}).success).toBe(true);
	});
});

describe("Live voice pricing from the catalogue", () => {
	const withCards = (voice: unknown) => vi.mocked(loadPriceCard).mockImplementation(async (_provider, _model, endpoint) =>
		(endpoint === "audio.realtime" ? voice : config.backendCard) as any);
	afterEach(() => { vi.mocked(loadPriceCard).mockReset(); vi.mocked(loadPriceCard).mockResolvedValue(null); });

	it("snapshots each Live model's own audio.realtime card", async () => {
		const card11 = { ...LIVE_VOICE_CARD, model: "openai/gpt-live-1.1" };
		withCards(card11);
		const live = await createLiveConfig("gpt-live-1.1", config.backendModel);
		expect(vi.mocked(loadPriceCard)).toHaveBeenCalledWith("openai", "openai/gpt-live-1.1", "audio.realtime");
		expect(live.voiceCard).toEqual(card11);
		const bill = priceLiveUsage({ live_seconds: 90 }, live) as any;
		expect(bill.live_voice_nanos).toBe(75_000_000);
		expect(bill.pricing.lines).toEqual([expect.objectContaining({ dimension: "audio_minutes", model: "openai/gpt-live-1.1", component: "voice" })]);
	});
	it("refuses to start without an active-minute price, and never for a model that isn't Live", async () => {
		withCards({ ...LIVE_VOICE_CARD, rules: LIVE_VOICE_CARD.rules.filter((rule) => rule.meter !== "audio_minutes") });
		await expect(createLiveConfig("openai/gpt-live-1", config.backendModel)).rejects.toThrow("live_price_card_missing");
		withCards(LIVE_VOICE_CARD);
		await expect(createLiveConfig("openai/gpt-realtime-2.1", config.backendModel)).rejects.toThrow("live_model_not_supported");
	});
	// OpenAI's split from a live WebRTC session on 2026-11-20 (gpt-live-1.1): active time
	// dropped from 14 to 11 s between updates while the total kept rising.
	const realSplit = [
		{ type: "session.usage.updated", usage: { active_seconds: 14, paused_seconds: 1, seconds: 15 } },
		{ type: "session.usage.updated", usage: { active_seconds: 11, paused_seconds: 7, seconds: 18 } },
		{ type: "session.closed", usage: { active_seconds: 11, paused_seconds: 11, seconds: 22 } },
	];
	const ingestAll = (events: Record<string, unknown>[]) => events.reduce((usage, event) => ingestLiveUsage(usage, event), { live_started: true } as LiveUsage);

	it("bills OpenAI's final active and paused split, accepting a drop in active time", () => {
		const usage = ingestAll(realSplit);
		expect(usage).toMatchObject({ live_seconds: 22, live_active_seconds: 11, live_paused_seconds: 11, live_final: true });
		expect(() => assertLiveFinalUsage(usage)).not.toThrow();
		const bill = priceLiveUsage(usage, config) as any;
		// 11/60 × $0.05 active and 11/60 × $0.02 standby.
		expect(bill.pricing.lines.map((line: any) => [line.dimension, line.line_nanos])).toEqual([
			["audio_minutes", 9_166_667], ["standby_audio_minutes", 3_666_667]]);
		expect(bill.live_voice_nanos).toBe(12_833_334);
		expect(liveUsageMeters(usage)).toMatchObject({ audio_seconds: 11, audio_minutes: 11 / 60, standby_audio_minutes: 11 / 60 });
	});
	it("prices the running estimate from the latest split, as holds use it", () => {
		const midCall = ingestAll(realSplit.slice(0, 2));
		expect((priceLiveUsage(midCall, config) as any).live_voice_nanos)
			.toBe((priceLiveUsage({ live_seconds: 11 }, config) as any).live_voice_nanos + 2_333_333);
		expect(() => ingestAll([...realSplit, { type: "session.usage.updated", usage: { active_seconds: 30, paused_seconds: 0, seconds: 21 } }]))
			.toThrow("usage_regressed");
	});
	it.each([
		["a split that doesn't add up", { active_seconds: 5, paused_seconds: 11, seconds: 22 }, "active 5 + paused 11 != seconds 22"],
		["half a split", { paused_seconds: 11, seconds: 22 }, "incomplete split"],
		["a negative split", { active_seconds: -1, paused_seconds: 23, seconds: 22 }, "incomplete split"],
	])("bills all seconds as active for %s and records why", (_name, final, reason) => {
		const usage = ingestAll([...realSplit.slice(0, 2), { type: "session.closed", usage: final }]);
		expect(usage).toMatchObject({ live_seconds: 22, live_usage_split_ignored: reason });
		expect(usage.live_active_seconds).toBeUndefined();
		expect((priceLiveUsage(usage, config) as any).live_voice_nanos).toBe(18_333_333);
	});
	it("bills all seconds as active without a split, as WebSocket sessions may report", () => {
		const usage = ingestAll([{ type: "session.closed", usage: { seconds: 22 } }]);
		expect(usage.live_usage_split_ignored).toBeUndefined();
		expect((priceLiveUsage(usage, config) as any).live_voice_nanos).toBe(18_333_333);
	});
	it("allows a second of rounding but never bills more than OpenAI's total", () => {
		const usage = ingestAll([{ type: "session.closed", usage: { active_seconds: 12, paused_seconds: 11, seconds: 22 } }]);
		expect(usage).toMatchObject({ live_active_seconds: 12, live_paused_seconds: 11 });
		// 12 s active and the remaining 10 s standby.
		expect((priceLiveUsage(usage, config) as any).live_voice_nanos).toBe(10_000_000 + 3_333_333);
	});
	it("bills paused time at the active rate on a card without a standby price", async () => {
		const activeOnly = { ...LIVE_VOICE_CARD, rules: LIVE_VOICE_CARD.rules.filter((rule) => rule.meter === "audio_minutes") };
		withCards(activeOnly);
		const live = await createLiveConfig("openai/gpt-live-1", config.backendModel);
		expect((priceLiveUsage(ingestAll(realSplit), live) as any).live_voice_nanos).toBe(18_333_333);
		const legacy = priceLiveUsage(ingestAll(realSplit), { ...config, voiceCard: LEGACY_LIVE_VOICE_CARD }) as any;
		expect(legacy.live_voice_nanos).toBe(18_333_333);
		expect(legacy.pricing.lines).toEqual([expect.objectContaining({ dimension: "audio_seconds", quantity: 22 })]);
	});
	it.each([[45.8, 38_166_667], [60, 50_000_000], [1, 833_333], [0, 0]])(
		"settles a session snapshotted before catalogue pricing at the same rate (%s s)", (seconds, nanos) => {
			const legacy = { ...config, voiceCard: LEGACY_LIVE_VOICE_CARD };
			const bill = priceLiveUsage({ live_seconds: seconds }, legacy) as any;
			expect(bill.live_voice_nanos).toBe(nanos);
			expect(bill.live_voice_nanos).toBe((priceLiveUsage({ live_seconds: seconds }, config) as any).live_voice_nanos);
			if (seconds) expect(bill.pricing.lines[0]).toMatchObject({ dimension: "audio_seconds", component: "voice" });
		});
	it("sends the session's own Live model upstream", () => {
		expect(liveStartEvent(config, "marin", undefined, "openai/gpt-live-1.1").session.model).toBe("gpt-live-1.1");
		expect(liveStartEvent(config, "marin").session.model).toBe("gpt-live-1");
		expect(() => liveStartEvent(config, "marin", undefined, "openai/gpt-realtime-2.1")).toThrow("live_model_not_supported");
	});
	it("accepts both Live models on /v1/live/sessions and nothing else", () => {
		for (const model of ["openai/gpt-live-1", "gpt-live-1", "openai/gpt-live-1.1", "gpt-live-1.1"]) {
			expect(createLiveSessionSchema.safeParse({ model, provider: "openai" }).success).toBe(true);
		}
		for (const model of ["openai/gpt-live-1-mini", "openai/gpt-live-2", "openai/gpt-realtime-2.1"]) {
			expect(createLiveSessionSchema.safeParse({ model, provider: "openai" }).success).toBe(false);
		}
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
