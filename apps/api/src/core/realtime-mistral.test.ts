import { afterEach, describe, expect, it, vi } from "vitest";
import recording from "./__fixtures__/realtime/mistral-realtime-transcription.json";
import {
	applyMistralTranscriptionUsage,
	mistralCanonicalModel,
	mistralProviderModel,
	mistralRealtimeUrl,
	sanitizeMistralSessionUpdate,
} from "./mistral-realtime";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import {
	assertRealtimeBillingMetersPresent,
	canonicalModel,
	normalizeRealtimeUsage,
	priceRealtimeUsage,
	providerFromModel,
	realtimeMaxDurationSeconds,
} from "./realtime-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({
		session: { final_cost_nanos: 1_165_334 },
		settlement: { final_cost_nanos: 1_165_334, debt_nanos: 0, uncollected_nanos: 0 },
	})),
	markRealtimeSessionBillingUnresolved: vi.fn(async () => ({})),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn(), getBindings: () => ({ MISTRAL_API_KEY: "test" }) }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionBillingUnresolved: mocks.markRealtimeSessionBillingUnresolved,
}));

const OPEN = 1;
const created = recording.events[0];
const deltas = recording.events.filter(({ event }) => event.type === "transcription.text.delta");
const done = recording.events.find(({ event }) => event.type === "transcription.done")!;

// Mistral's list price for Voxtral Mini Transcribe Realtime 3: $0.008 per input audio minute.
const card = {
	provider: "mistral", model: "mistral/voxtral-mini-transcribe-realtime-3", endpoint: "audio.realtime", currency: "USD",
	effective_from: null, effective_to: null, version: "test",
	rules: [{ pricing_plan: "standard", meter: "input_audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.008",
		currency: "USD", match: [], priority: 100 }],
} as any;

// 100 ms of 16 kHz pcm_s16le: 1,600 samples.
const chunk = Buffer.alloc(3_200, 1).toString("base64");

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
	object.session = { session_id: "rt_test", workspace_id: "workspace", key_id: "key", source: "api", provider: "mistral",
		model_id: "mistral/voxtral-mini-transcribe-realtime-3", provider_model_id: "voxtral-mini-transcribe-realtime-3-0", voice: null,
		metadata: {}, reserved_nanos: 5_000_000_000, estimated_cost_nanos: 0 };
	const listeners: Record<string, (event: any) => void> = {};
	object.upstream = { readyState: OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn(),
		addEventListener: vi.fn((name: string, handler: (event: any) => void) => { listeners[name] = handler; }) };
	object.client = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.claimedAtMs = Date.now();
	object.deadlineMs = Date.now() + realtimeMaxDurationSeconds("mistral") * 1000;
	object.usage = {};
	object.sendClientRaw = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	object.attachUpstream();
	return { object, storage, listeners };
}

const upstreamSent = (object: any) => object.upstream.send.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sent = (object: any) => object.sendClientRaw.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sentOfType = (object: any, type: string) => sent(object).filter((event: any) => event.type === type);
const play = async (object: any, events: Array<{ event: unknown }>) => {
	for (const { event } of events) await object.handleUpstreamMessage(JSON.stringify(event));
};
const speak = async (object: any, chunks: number) => {
	for (let i = 0; i < chunks; i += 1) {
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: chunk }));
		await vi.advanceTimersByTimeAsync(100);
	}
};

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("Mistral realtime transcription models", () => {
	it("maps catalogue and Mistral model ids", () => {
		expect(providerFromModel("mistral/voxtral-mini-transcribe-realtime-3")).toBe("mistral");
		expect(providerFromModel("voxtral-mini-transcribe-realtime-3-0", "mistral")).toBe("mistral");
		// Mistral's file transcription models are not realtime models.
		expect(providerFromModel("mistral/voxtral-mini-transcribe-3")).toBeNull();
		expect(canonicalModel("mistral", "voxtral-mini-transcribe-realtime-3-0")).toBe("mistral/voxtral-mini-transcribe-realtime-3");
		expect(mistralProviderModel("mistral/voxtral-mini-transcribe-realtime-3")).toBe("voxtral-mini-transcribe-realtime-3-0");
		expect(mistralProviderModel("mistral/voxtral-mini-transcribe-realtime")).toBe("voxtral-mini-transcribe-realtime-2602");
		expect(mistralCanonicalModel("voxtral-mini-transcribe-realtime-2602")).toBe("mistral/voxtral-mini-transcribe-realtime");
		expect(mistralRealtimeUrl("voxtral-mini-transcribe-realtime-3-0"))
			.toBe("wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-3-0");
	});

	it("lets a client change transcription settings but never the audio format the relay meters", () => {
		expect(sanitizeMistralSessionUpdate({ type: "session.update", session: { language: "fr", target_streaming_delay_ms: 480 } }))
			.toEqual({ type: "session.update", session: { language: "fr", target_streaming_delay_ms: 480 } });
		// A mixed update is rejected whole, so a client never thinks its sample rate changed.
		expect(sanitizeMistralSessionUpdate({ type: "session.update", session: {
			language: "fr", audio_format: { encoding: "pcm_s16le", sample_rate: 8000 },
		} })).toBeNull();
		expect(sanitizeMistralSessionUpdate({ type: "session.update", session: { audio_format: {} } })).toBeNull();
		expect(sanitizeMistralSessionUpdate({ type: "session.update" })).toBeNull();
	});
});

describe("Mistral realtime billing", () => {
	it("bills the audio the relay forwarded, with Mistral's whole-second count as a floor", () => {
		// Recorded: 8.74 s sent, Mistral reported 8.
		expect(applyMistralTranscriptionUsage({ input_audio_ms: 8_740 }, done.event)).toMatchObject({ input_audio_ms: 8_740, provider_audio_seconds: 8 });
		expect(applyMistralTranscriptionUsage({ input_audio_ms: 5_000 }, done.event).input_audio_ms).toBe(8_000);
		expect(applyMistralTranscriptionUsage({ input_audio_ms: 100 }, { type: "transcription.done" })).toEqual({ input_audio_ms: 100 });
	});

	it("prices per input audio minute and needs no token meters", () => {
		const usage = normalizeRealtimeUsage({ input_audio_ms: 8_740 });
		const priced = (priceRealtimeUsage(usage, card).pricing as any).total_nanos;
		// 8.74 s at $0.008 per minute.
		expect(priced).toBeGreaterThanOrEqual(1_165_333);
		expect(priced).toBeLessThanOrEqual(1_165_334);
		expect(() => assertRealtimeBillingMetersPresent({ provider: "mistral", usage, costNanos: priced })).not.toThrow();
	});
});

describe("Mistral realtime relay", () => {
	it("is ready on session.created, forwards 16 kHz audio as input_audio.append and meters it", async () => {
		vi.useFakeTimers();
		const { object } = relay();
		await play(object, [created]);
		expect(object.providerSetupComplete).toBe(true);
		expect(sentOfType(object, "session.created")).toHaveLength(1);
		await speak(object, 5);
		expect(upstreamSent(object)).toEqual(Array.from({ length: 5 }, () => ({ type: "input_audio.append", audio: chunk })));
		expect(object.usage.input_audio_ms).toBe(500);
		expect(object.usage.pending_input_audio_ms).toBeUndefined();
	});

	it("sends allowed session settings to Mistral and rejects the rest", async () => {
		const { object } = relay();
		await play(object, [created]);
		await object.handleClientMessage(JSON.stringify({ type: "session.update", session: { target_streaming_delay_ms: 240 } }));
		await object.handleClientMessage(JSON.stringify({ type: "session.update", session: { audio_format: {} } }));
		expect(upstreamSent(object)).toEqual([{ type: "session.update", session: { target_streaming_delay_ms: 240 } }]);
		expect(sentOfType(object, "relay.client_event_rejected")).toHaveLength(1);
	});

	it("on session.end flushes and ends the stream, forwards the final transcript, then settles once", async () => {
		vi.useFakeTimers();
		const { object } = relay();
		await play(object, [created]);
		await speak(object, 10);
		await play(object, deltas);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(upstreamSent(object).slice(-2)).toEqual([{ type: "input_audio.flush" }, { type: "input_audio.end" }]);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await play(object, [done]);
		expect(sentOfType(object, "transcription.done")).toHaveLength(1);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		// Mistral counted 8 s for this recording; the relay only forwarded 1 s here, so Mistral's count is billed.
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "completed", disconnectReason: "client_requested_end", usage: { input_audio_ms: 8_000, provider_audio_seconds: 8 },
		});
		// transcription.done reaches the client before session.ended.
		const types = sent(object).map((event: any) => event.type);
		expect(types.indexOf("transcription.done")).toBeLessThan(types.indexOf("session.ended"));
		expect(sentOfType(object, "session.ended")).toHaveLength(1);
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it("settles from metered audio if Mistral never sends transcription.done", async () => {
		vi.useFakeTimers();
		const { object } = relay();
		await play(object, [created]);
		await speak(object, 3);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ usage: { input_audio_ms: 300 } });
	});

	it("flushes and waits for the final transcript when the 60-minute cap is reached", async () => {
		vi.useFakeTimers();
		const { object, storage } = relay();
		await play(object, [created]);
		await speak(object, 10);
		// The duration alarm only acts on a session this object holds.
		storage.data.set("session_id", "rt_test");
		await object.alarm();
		expect(upstreamSent(object).slice(-2)).toEqual([{ type: "input_audio.flush" }, { type: "input_audio.end" }]);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await play(object, [done]);
		expect(sentOfType(object, "transcription.done")).toHaveLength(1);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "expired", disconnectReason: "realtime_max_duration" });
	});

	it("settles at once when no audio was sent", async () => {
		const { object } = relay();
		const upstream = object.upstream;
		await play(object, [created]);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(upstream.send).not.toHaveBeenCalled();
		expect(upstream.close).toHaveBeenCalledWith(1000, "realtime_relay_settling");
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ usage: {} });
	});
});
