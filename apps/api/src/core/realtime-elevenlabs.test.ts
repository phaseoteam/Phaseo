import { afterEach, describe, expect, it, vi } from "vitest";
import conversation from "./__fixtures__/realtime/elevenlabs-conversation-get.json";
import recording from "./__fixtures__/realtime/elevenlabs-realtime-session.json";
import {
	applyElevenLabsConversationCost,
	buildElevenLabsSessionUpdate,
	elevenLabsCanonicalModel,
	elevenLabsProviderModel,
	parseElevenLabsConversationCost,
} from "./elevenlabs-realtime";
import { ELEVENLABS_RELAY_COST_WAIT_MS, RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import {
	ELEVENLABS_REALTIME_MAX_DURATION_SECONDS,
	canonicalModel,
	normalizeRealtimeUsage,
	priceRealtimeUsage,
	providerFromModel,
	realtimeMaxDurationSeconds,
	reconciledProviderCost,
	resolveRealtimeFinalCostNanos,
} from "./realtime-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({
		session: { final_cost_nanos: 47_336_800 },
		settlement: { final_cost_nanos: 47_336_800, debt_nanos: 0, uncollected_nanos: 0 },
	})),
	markRealtimeSessionBillingUnresolved: vi.fn(async () => ({})),
	fetchCost: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn(), getBindings: () => ({ ELEVENLABS_API_KEY: "test" }) }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("./elevenlabs-realtime", async (importOriginal) => ({
	...(await importOriginal<typeof import("./elevenlabs-realtime")>()),
	fetchElevenLabsConversationCost: mocks.fetchCost,
}));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionBillingUnresolved: mocks.markRealtimeSessionBillingUnresolved,
}));

const OPEN = 1;
const reported = parseElevenLabsConversationCost(conversation.conversation);
const processing = { ready: false, status: "processing" };

// A test card at ElevenLabs' list prices: ~$0.08 per realtime minute, $0.20/$6 per 1M LLM tokens.
const card = {
	provider: "elevenlabs", model: "eleven-labs/eleven-realtime-v1-mini", endpoint: "audio.realtime", currency: "USD",
	effective_from: null, effective_to: null, version: "test",
	rules: [
		["audio_minutes", "minute", 1, "0.08"],
		["input_text_tokens", "token", 1_000_000, "0.2"],
		["output_text_tokens", "token", 1_000_000, "6"],
	].map(([meter, unit, unitSize, price]) => ({ pricing_plan: "standard", meter, unit, unit_size: unitSize, price_per_unit: price,
		currency: "USD", match: [], priority: 100 })),
} as any;

function relay() {
	const data = new Map<string, unknown>();
	const storage = {
		data,
		put: vi.fn(async (key: string | Record<string, unknown>, value?: unknown) => {
			if (typeof key === "string") data.set(key, structuredClone(value));
			else for (const [entry, item] of Object.entries(key)) data.set(entry, structuredClone(item));
		}),
		get: vi.fn(async (key: string) => structuredClone(data.get(key))),
		setAlarm: vi.fn(async () => undefined),
		deleteAll: vi.fn(async () => data.clear()),
		deleteAlarm: vi.fn(async () => undefined),
	};
	const object = new RealtimeRelayDurableObject({ waitUntil: vi.fn(), storage } as any, {} as any) as any;
	object.session = { session_id: "rt_test", workspace_id: "workspace", key_id: "key", source: "api", provider: "elevenlabs",
		model_id: "eleven-labs/eleven-realtime-v1-mini", provider_model_id: "eleven_realtime_v1_mini", voice: "brian",
		metadata: {}, reserved_nanos: 5_000_000_000, estimated_cost_nanos: 0 };
	const listeners: Record<string, (event: any) => void> = {};
	object.upstream = { readyState: OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn(),
		addEventListener: vi.fn((name: string, handler: (event: any) => void) => { listeners[name] = handler; }) };
	object.client = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.claimedAtMs = Date.now();
	object.deadlineMs = Date.now() + ELEVENLABS_REALTIME_MAX_DURATION_SECONDS * 1000;
	object.usage = { provider_connected_at_ms: Date.now() };
	object.sendClientRaw = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	object.emitTurnTelemetry = vi.fn(async () => undefined);
	object.elevenLabsQuickRetryMs = [0];
	object.attachUpstream();
	return { object, storage, listeners };
}

const sent = (object: any) => object.sendClientRaw.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sentOfType = (object: any, type: string) => sent(object).filter((event: any) => event.type === type);
const play = async (object: any, events: Array<{ event: unknown }>) => {
	for (const { event } of events) await object.handleUpstreamMessage(JSON.stringify(event));
};

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("ElevenLabs Realtime models and setup", () => {
	it("maps catalogue and provider model ids", () => {
		expect(providerFromModel("eleven-labs/eleven-realtime-v1-mini")).toBe("elevenlabs");
		expect(providerFromModel("eleven_realtime_v1_mini", "elevenlabs")).toBe("elevenlabs");
		expect(canonicalModel("elevenlabs", "eleven_realtime_v1_mini")).toBe("eleven-labs/eleven-realtime-v1-mini");
		expect(elevenLabsCanonicalModel("elevenlabs/eleven_realtime_v1_mini")).toBe("eleven-labs/eleven-realtime-v1-mini");
		expect(elevenLabsProviderModel("eleven-labs/eleven-realtime-v1-mini")).toBe("eleven_realtime_v1_mini");
		expect(realtimeMaxDurationSeconds("elevenlabs")).toBe(30 * 60);
		expect(providerFromModel("eleven-labs/eleven-realtime-v1-max")).toBe("elevenlabs");
		expect(elevenLabsProviderModel("eleven-labs/eleven-realtime-v1-max")).toBe("eleven_realtime_v1_max");
		expect(canonicalModel("elevenlabs", "eleven_realtime_v1_max")).toBe("eleven-labs/eleven-realtime-v1-max");
	});

	it("chooses the model in session.update, since ElevenLabs ignores ?model= (recorded 2026-10-23)", () => {
		expect(buildElevenLabsSessionUpdate({ model: "eleven_realtime_v1_max" }).session.model).toBe("eleven_realtime_v1_max");
	});

	it("asks ElevenLabs for a session a minute longer than the gateway cap, never under its 60 s minimum", () => {
		expect(buildElevenLabsSessionUpdate({ model: "eleven_realtime_v1_mini", voice: "brian", maxDurationSeconds: 1860 }).session).toMatchObject({
			model: "eleven_realtime_v1_mini", max_duration_seconds: 1860, audio: { input: { format: { type: "audio/pcm", rate: 24_000 } }, output: { voice: "brian" } },
		});
		expect(buildElevenLabsSessionUpdate({ model: "eleven_realtime_v1_mini", maxDurationSeconds: 20 }).session.max_duration_seconds).toBe(60);
		expect(buildElevenLabsSessionUpdate({ model: "eleven_realtime_v1_mini" })).not.toHaveProperty("session.max_duration_seconds");
	});
});

describe("ElevenLabs conversation cost (recorded GET)", () => {
	it("reads the charge, billed minutes and LLM tokens", () => {
		expect(reported).toEqual({ ready: true, status: "done", costNanos: 47_130_741, audioMs: 35_245,
			inputTextTokens: 1174, outputTextTokens: 17 });
		expect(parseElevenLabsConversationCost({ ...conversation.conversation, status: "processing" })).toEqual(processing);
		expect(parseElevenLabsConversationCost({ status: "done", metadata: {} }).ready).toBe(false);
	});

	it("prices at list prices at or above what ElevenLabs charged, and the charge is the floor", () => {
		const usage = applyElevenLabsConversationCost({ session_audio_ms: 35_250, audio_ms: 35_250 }, reported as any);
		expect(usage).toMatchObject({ audio_ms: 35_250, input_text_tokens: 1174, output_text_tokens: 17, provider_audio_ms: 35_245 });
		const priced = (priceRealtimeUsage(normalizeRealtimeUsage(usage), card).pricing as any).total_nanos;
		// 35.25 s at $0.08/min + 1174 x $0.20/M + 17 x $6/M.
		expect(priced).toBe(47_336_800);
		expect(resolveRealtimeFinalCostNanos({ auth: { internal: true }, pricedCostNanos: priced, providerCostNanos: 47_130_741 })).toBe(47_336_800);
		// A shorter local meter cannot bill less than the minutes ElevenLabs charged.
		expect(applyElevenLabsConversationCost({ session_audio_ms: 30_000 }, reported as any).audio_ms).toBe(35_245);
		expect(resolveRealtimeFinalCostNanos({ auth: { internal: true }, pricedCostNanos: 40_000_000, providerCostNanos: 47_130_741 })).toBe(47_130_741);
	});
});

describe("ElevenLabs relay", () => {
	it("ends the call before any reply when ElevenLabs confirms a different model than the one priced", async () => {
		vi.useFakeTimers();
		const { object } = relay();
		object.elevenLabsModel = "eleven_realtime_v1_max";
		mocks.fetchCost.mockResolvedValue(reported);
		await object.handleUpstreamMessage(JSON.stringify(recording.events[0].event));
		await object.handleUpstreamMessage(JSON.stringify(recording.session_updated));
		expect(object.providerSetupComplete).toBe(false);
		expect(object.acceptingAudio).toBe(false);
		expect(object.end).toMatchObject({ reason: "provider_error", initiatedBy: "provider" });
	});

	it("accepts the session when ElevenLabs confirms the requested model", async () => {
		const { object } = relay();
		object.elevenLabsModel = "eleven_realtime_v1_mini";
		await object.handleUpstreamMessage(JSON.stringify(recording.session_updated));
		expect(object.providerSetupComplete).toBe(true);
		expect(object.end).toBeNull();
	});

	it("records the conversation, retries a refused session length with ElevenLabs' default, and keeps the error from the client", async () => {
		vi.useFakeTimers();
		const { object, storage } = relay();
		await play(object, recording.events);
		expect(object.usage.provider_conversation_id).toBe("conv_4101m5hp9pdze1bajbw3gjssccra");
		expect(object.upstream.send).toHaveBeenLastCalledWith(JSON.stringify(buildElevenLabsSessionUpdate({ model: "eleven_realtime_v1_mini", voice: "brian", instructions: null })));
		expect(object.deadlineMs).toBe(object.claimedAtMs + 595_000);
		expect(storage.setAlarm).toHaveBeenLastCalledWith(object.claimedAtMs + 595_000);
		expect(sentOfType(object, "error")).toHaveLength(0);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await object.handleUpstreamMessage(JSON.stringify(recording.session_updated));
		expect(object.providerSetupComplete).toBe(true);
	});

	it("meters connected time, settles with the reported charge as a floor, and ignores the 1006 that follows its own close", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-22T11:35:15.508Z"));
		const { object, listeners } = relay();
		await play(object, recording.events.slice(0, 2));
		await object.handleUpstreamMessage(JSON.stringify(recording.session_updated));
		await play(object, recording.response);
		// response.done carries no usage on ElevenLabs; nothing is left pending.
		expect(object.hasPendingBilling()).toBe(false);
		vi.setSystemTime(new Date(Date.parse("2026-10-22T11:35:15.508Z") + 35_250));
		mocks.fetchCost.mockResolvedValueOnce(reported);
		const upstream = object.upstream;
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(upstream.close).toHaveBeenCalledWith(1000, "realtime_relay_settling");
		expect(mocks.fetchCost).toHaveBeenCalledWith("conv_4101m5hp9pdze1bajbw3gjssccra");
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "completed", disconnectReason: "client_requested_end", providerCostNanos: 47_130_741, estimated: false,
			usage: { session_audio_ms: 35_250, audio_ms: 35_250, input_text_tokens: 1174, output_text_tokens: 17, provider_cost_status: "reconciled" },
		});
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ reason: "client_requested", billing_status: "settled",
			cost: expect.objectContaining({ total_nanos: 47_336_800 }) })]);
		// ElevenLabs answers the relay's close with an error and a 1006 drop.
		listeners.error?.({});
		listeners.close?.(recording.close_after_client_close);
		await object.upstreamEvents;
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(sentOfType(object, "session.ended")).toHaveLength(1);
		expect(sentOfType(object, "relay.upstream_error")).toHaveLength(0);
	});

	it("reports a pending bill while ElevenLabs is still finishing the conversation, then settles from its charge", async () => {
		vi.useFakeTimers();
		const { object, storage } = relay();
		await play(object, recording.events.slice(0, 1));
		mocks.fetchCost.mockResolvedValueOnce(processing);
		await object.handleClientGone();
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ billing_status: "pending",
			final_bill: { method: "GET", path: "/v1/generations?id=realtime%3Art_test" } })]);
		expect(storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + 30_000);
		await vi.advanceTimersByTimeAsync(30_000);
		mocks.fetchCost.mockResolvedValueOnce(reported);
		await object.alarm();
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ providerCostNanos: 47_130_741, disconnectReason: "client_disconnected" });
		expect(sentOfType(object, "session.ended")).toHaveLength(1);
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it("keeps the bill pending for a day, backing off, then opens a review instead of undercharging", async () => {
		vi.useFakeTimers();
		const { object, storage } = relay();
		await play(object, recording.events.slice(0, 1));
		mocks.fetchCost.mockRejectedValue(new Error("elevenlabs_conversation_http_503"));
		await vi.advanceTimersByTimeAsync(20_000);
		await object.handleClientGone();
		expect(storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + 30_000);
		await vi.advanceTimersByTimeAsync(15 * 60_000);
		await object.alarm();
		// Past the first 10 minutes it retries every 10 minutes.
		expect(storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + 10 * 60_000);
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(ELEVENLABS_RELAY_COST_WAIT_MS);
		await object.alarm();
		// Connected time alone would leave out the language-model tokens ElevenLabs charged.
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		expect(mocks.markRealtimeSessionBillingUnresolved).toHaveBeenCalledOnce();
		const call = mocks.markRealtimeSessionBillingUnresolved.mock.calls[0][0] as any;
		expect(call.reason).toBe("realtime_provider_cost_unavailable");
		// Connected time stops at the close, not when settlement finally runs.
		expect(call.usage).toMatchObject({ provider_cost_status: "unavailable", session_audio_ms: 20_000 });
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ billing_status: "pending" })]);
		mocks.fetchCost.mockReset();
	});

	it("rechecks billing on quiet calls and treats them as connected time, not pending turns", async () => {
		vi.useFakeTimers();
		const { object } = relay();
		await object.handleUpstreamMessage(JSON.stringify(recording.response[0].event));
		expect(object.responseInFlight).toBe(true);
		expect(object.hasPendingBilling()).toBe(false);
		await vi.advanceTimersByTimeAsync(90_000);
		object.refreshProviderSessionDuration();
		expect(object.usage.session_audio_ms).toBe(90_000);
	});
});

describe("ElevenLabs reconciliation without relay state", () => {
	const session = (lastEventAt: string) => ({ session_id: "rt_x", model_id: "eleven-labs/eleven-realtime-v1-mini", provider: "elevenlabs",
		started_at: lastEventAt, last_event_at: lastEventAt, usage: { provider_conversation_id: "conv_4101m5hp9pdze1bajbw3gjssccra", session_audio_ms: 30_000, audio_ms: 30_000 } }) as any;

	it("uses the reported charge, waits while it is pending, then reports the charge unavailable", async () => {
		mocks.fetchCost.mockResolvedValueOnce(reported);
		expect(await reconciledProviderCost(session(new Date().toISOString()))).toMatchObject({ providerCostNanos: 47_130_741,
			usage: { audio_ms: 35_245, input_text_tokens: 1174 } });
		mocks.fetchCost.mockResolvedValueOnce(processing);
		await expect(reconciledProviderCost(session(new Date().toISOString()))).rejects.toThrow("realtime_elevenlabs_cost_pending");
		mocks.fetchCost.mockResolvedValueOnce(processing);
		mocks.fetchCost.mockResolvedValueOnce(processing);
		await expect(reconciledProviderCost(session(new Date(Date.now() - 2 * 60 * 60_000).toISOString()))).rejects.toThrow("realtime_elevenlabs_cost_pending");
		mocks.fetchCost.mockResolvedValueOnce(processing);
		expect(await reconciledProviderCost(session(new Date(Date.now() - 25 * 60 * 60_000).toISOString())))
			.toEqual({ usage: expect.objectContaining({ provider_cost_status: "unavailable", audio_ms: 30_000 }), costUnavailable: true });
	});
});
