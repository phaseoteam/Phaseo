import { afterEach, describe, expect, it, vi } from "vitest";
import recording from "./__fixtures__/realtime/elevenlabs-scribe-realtime-transcription.json";
import {
	ElevenLabsScribeTranscript,
	elevenLabsScribeCanonicalModel,
	elevenLabsScribeProviderModel,
	elevenLabsScribeRealtimeUrl,
	mergeElevenLabsScribeSessionUpdate,
} from "./elevenlabs-scribe-realtime";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import {
	assertRealtimeBillingMetersPresent,
	canonicalModel,
	normalizeRealtimeUsage,
	priceRealtimeUsage,
	providerFromModel,
	realtimeBilledMeters,
	realtimeCatalogueProvider,
	realtimeMaxDurationSeconds,
} from "./realtime-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({
		session: { final_cost_nanos: 905_140 },
		settlement: { final_cost_nanos: 905_140, debt_nanos: 0, uncollected_nanos: 0 },
	})),
	markRealtimeSessionBillingUnresolved: vi.fn(async () => ({})),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn(), getBindings: () => ({ ELEVENLABS_API_KEY: "test" }) }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionBillingUnresolved: mocks.markRealtimeSessionBillingUnresolved,
}));

const OPEN = 1;
type Recorded = { event?: Record<string, any>; sent?: string };
const recorded = recording.events as Recorded[];
const ofType = (type: string) => recorded.filter((entry) => entry.event?.message_type === type).map((entry) => entry.event!);
const started = ofType("session_started")[0];
const finalCommitAt = recorded.findIndex((entry) => entry.sent === "final_commit");
// Everything ElevenLabs sent before the relay's final commit, and the answer to it.
const beforeEnd = recorded.slice(0, finalCommitAt).filter((entry) => entry.event && entry.event.message_type !== "session_started");
const afterEnd = recorded.slice(finalCommitAt + 1).filter((entry) => entry.event?.message_type && entry.event.message_type !== "commit_throttled");
const throttled = ofType("commit_throttled")[0];
const allSettings = { diarize: true, include_timestamps: true, include_language_detection: true, commit_strategy: "vad" as const };

// ElevenLabs' list price for Scribe v3 Live: $0.22 per audio hour, saved as 220,000,000 nanos per 60 minutes.
const card = {
	provider: "elevenlabs", model: "eleven-labs/scribe-v3-live", endpoint: "audio.realtime", currency: "USD",
	effective_from: null, effective_to: null, version: "test",
	rules: [{ pricing_plan: "standard", meter: "input_audio_minutes", unit: "minute", unit_size: 60, price_per_unit: "0.22",
		currency: "USD", match: [], priority: 100 }],
} as any;

// 100 ms of 16 kHz PCM16: 1,600 samples.
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
	object.session = { session_id: "rt_test", workspace_id: "workspace", key_id: "key", source: "api", provider: "elevenlabs",
		model_id: "eleven-labs/scribe-v3-live", provider_model_id: "scribe_v3_live", voice: null,
		metadata: {}, reserved_nanos: 5_000_000_000, estimated_cost_nanos: 0 };
	const listeners: Record<string, (event: any) => void> = {};
	const upstream = { readyState: OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn(), accept: vi.fn(),
		addEventListener: vi.fn((name: string, handler: (event: any) => void) => { listeners[name] = handler; }) };
	const fetch = vi.fn(async (_url: string, _init?: RequestInit) => ({ status: 101, webSocket: upstream }));
	vi.stubGlobal("fetch", fetch);
	object.client = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.claimedAtMs = Date.now();
	object.deadlineMs = Date.now() + realtimeMaxDurationSeconds("elevenlabs-scribe") * 1000;
	object.usage = {};
	object.sendClientRaw = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	return { object, storage, listeners, upstream, fetch };
}

const upstreamSent = (upstream: any) => upstream.send.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sent = (object: any) => object.sendClientRaw.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sentOfType = (object: any, type: string) => sent(object).filter((event: any) => event.type === type);
const play = async (object: any, events: Array<Record<string, unknown>>) => {
	for (const event of events) await object.handleUpstreamMessage(JSON.stringify(event));
};
const speak = async (object: any, chunks: number) => {
	for (let i = 0; i < chunks; i += 1) {
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: chunk }));
		await vi.advanceTimersByTimeAsync(100);
	}
};

/** Connects the relay, applies settings, streams audio and completes ElevenLabs' setup. */
async function streaming(settings: Record<string, unknown> | null, chunks: number) {
	const harness = relay();
	await harness.object.connectProvider();
	if (settings) await harness.object.handleClientMessage(JSON.stringify({ type: "session.update", session: settings }));
	await harness.object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: chunk }));
	await vi.advanceTimersByTimeAsync(0);
	await play(harness.object, [started]);
	await vi.advanceTimersByTimeAsync(100);
	await speak(harness.object, chunks - 1);
	return harness;
}

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("ElevenLabs Scribe Live models", () => {
	it("is told apart from the Eleven Realtime voice models but stays provider elevenlabs in the catalogue", () => {
		expect(providerFromModel("eleven-labs/scribe-v3-live")).toBe("elevenlabs-scribe");
		expect(providerFromModel("eleven-labs/scribe-v3-live", "elevenlabs")).toBe("elevenlabs-scribe");
		expect(providerFromModel("scribe_v3_live", "elevenlabs")).toBe("elevenlabs-scribe");
		expect(providerFromModel("eleven-labs/eleven-realtime-v1-mini", "elevenlabs")).toBe("elevenlabs");
		// The batch model is not a realtime model.
		expect(providerFromModel("eleven-labs/scribe-v3", "elevenlabs")).toBe("elevenlabs");
		expect(realtimeCatalogueProvider("elevenlabs-scribe")).toBe("elevenlabs");
		expect(realtimeCatalogueProvider("elevenlabs")).toBe("elevenlabs");
		expect(canonicalModel("elevenlabs-scribe", "scribe_v3_live")).toBe("eleven-labs/scribe-v3-live");
		expect(elevenLabsScribeCanonicalModel("elevenlabs/scribe-v3-live")).toBe("eleven-labs/scribe-v3-live");
		expect(elevenLabsScribeProviderModel("eleven-labs/scribe-v3-live")).toBe("scribe_v3_live");
		expect(realtimeMaxDurationSeconds("elevenlabs-scribe")).toBe(60 * 60);
	});

	it("puts the settings in the socket URL, with 16 kHz PCM and VAD commits by default", () => {
		const url = new URL(elevenLabsScribeRealtimeUrl("scribe_v3_live", {}));
		expect(`${url.origin}${url.pathname}`).toBe("wss://api.elevenlabs.io/v1/speech-to-text/realtime");
		expect(Object.fromEntries(url.searchParams)).toEqual({ model_id: "scribe_v3_live", audio_format: "pcm_16000", commit_strategy: "vad" });
		const full = new URL(elevenLabsScribeRealtimeUrl("scribe_v3_live", {
			language: "en", secondary_languages: ["es", "fr"], commit_strategy: "turn_prediction", vad_silence_threshold_secs: 0.5,
			diarize: true, multilang_mode: true, include_timestamps: true, no_verbatim: false, previous_text: "Not in the URL",
		}));
		expect(full.searchParams.get("language_code")).toBe("en");
		expect(full.searchParams.getAll("secondary_languages")).toEqual(["es", "fr"]);
		expect(full.searchParams.get("commit_strategy")).toBe("turn_prediction");
		expect(full.searchParams.get("vad_silence_threshold_secs")).toBe("0.5");
		expect(full.searchParams.get("diarize")).toBe("true");
		expect(full.searchParams.get("multilang_mode")).toBe("true");
		expect(full.searchParams.get("no_verbatim")).toBe("false");
		expect(full.searchParams.has("previous_text")).toBe(false);
	});

	it("accepts transcription settings and refuses paid add-ons, the audio format and invalid values", () => {
		const update = (session: unknown, current = {}) => mergeElevenLabsScribeSessionUpdate(current, { type: "session.update", session });
		expect(update({ language: "EN", diarize: true })).toEqual({ ok: true, settings: { language: "en", diarize: true } });
		expect(update({ language: null }, { language: "en", diarize: true })).toEqual({ ok: true, settings: { diarize: true } });
		for (const field of ["keyterms", "keyterm_library", "transcript_edit", "entity_detection", "entity_redaction"]) {
			expect(update({ diarize: true, [field]: ["Phaseo"] })).toEqual({ ok: false, reason: "realtime_transcription_option_not_supported", param: field });
		}
		expect(update({ audio_format: "pcm_8000" })).toMatchObject({ ok: false, param: "audio_format" });
		expect(update({ commit_strategy: "sometimes" })).toMatchObject({ ok: false, param: "commit_strategy" });
		expect(update({ vad_silence_threshold_secs: 0.1 })).toMatchObject({ ok: false, param: "vad_silence_threshold_secs" });
		expect(update({ secondary_languages: ["english"] })).toMatchObject({ ok: false, param: "secondary_languages" });
		expect(update({})).toMatchObject({ ok: false });
		expect(mergeElevenLabsScribeSessionUpdate({}, { type: "session.update" })).toMatchObject({ ok: false });
		// ElevenLabs refuses both combinations and closes the connection.
		expect(update({ filter_background_audio: true, include_timestamps: true })).toMatchObject({ ok: false, param: "filter_background_audio" });
		expect(update({ filter_background_audio: true }, { diarize: true })).toMatchObject({ ok: false, param: "filter_background_audio" });
	});
});

describe("ElevenLabs Scribe Live events", () => {
	it("translates the recorded session to transcription events with the full transcript", () => {
		const transcript = new ElevenLabsScribeTranscript(allSettings);
		const events = recorded.filter((entry) => entry.event && entry.event.message_type !== "commit_throttled")
			.flatMap((entry) => transcript.translate(entry.event!).events);
		const types = (type: string) => events.filter((event) => event.type === type);
		expect(types("session.created")[0]).toMatchObject({ session: { model_id: "scribe_v3_live", sample_rate: 16_000 } });
		expect(types("transcription.partial").length).toBe(ofType("partial_transcript").length);
		expect(types("transcription.partial")[0]).toMatchObject({ text: "With a", turn_probability: 0.01 });
		const committed = ofType("committed_transcript").map((event) => event.text);
		expect(types("transcription.segment")).toEqual(committed.map((text, index) => ({ type: "transcription.segment", segment_index: index, text })));
		// Deltas join into the transcript; ElevenLabs' committed text has no leading space.
		const deltas = types("transcription.text.delta").map((event) => event.text).join("");
		expect(deltas).toBe(committed.join(" "));
		expect(types("transcription.language")).toEqual([{ type: "transcription.language", audio_language: "en" }]);
		expect(types("transcription.segment.words").map((event) => event.segment_index)).toEqual([0, 1]);
		expect(types("transcription.segment.speakers").map((event) => event.segment_index)).toEqual([0, 1]);
		expect(types("transcription.segment.speakers")[0].words[0]).toMatchObject({ text: "With", speaker_id: "speaker_0" });
		expect(transcript.complete).toBe(true);
		expect(transcript.done()).toEqual({ type: "transcription.done", text: committed.join(" "), language: "en", segment_count: 2 });
	});

	it("is incomplete until every commit has its timestamps and speaker labels", () => {
		const transcript = new ElevenLabsScribeTranscript(allSettings);
		transcript.translate(ofType("committed_transcript")[0]);
		expect(transcript.complete).toBe(false);
		transcript.translate(ofType("diarized_transcript")[0]);
		expect(transcript.complete).toBe(false);
		transcript.translate(ofType("committed_transcript_with_timestamps")[0]);
		expect(transcript.complete).toBe(true);
		// Without follow-up options a commit is complete on its own.
		const plain = new ElevenLabsScribeTranscript({});
		plain.translate(ofType("committed_transcript")[0]);
		expect(plain.complete).toBe(true);
	});

	it("turns ElevenLabs errors into error events", () => {
		const transcript = new ElevenLabsScribeTranscript({});
		expect(transcript.translate(throttled)).toEqual({ kind: "error", events: [{ type: "error", error: {
			type: "commit_throttled", message: throttled.error, provider: "elevenlabs",
		} }] });
	});
});

describe("ElevenLabs Scribe Live billing", () => {
	it("prices the audio the relay sent per input audio minute", () => {
		expect(realtimeBilledMeters("elevenlabs-scribe")).toEqual(["input_audio_minutes"]);
		const usage = normalizeRealtimeUsage({ input_audio_ms: recording.sent_audio_ms });
		const priced = (priceRealtimeUsage(usage, card, "elevenlabs-scribe").pricing as any).total_nanos;
		// 14.811 s at $0.22 per hour.
		expect(priced).toBeGreaterThanOrEqual(905_116);
		expect(priced).toBeLessThanOrEqual(905_117);
		expect(() => assertRealtimeBillingMetersPresent({ provider: "elevenlabs-scribe", usage, costNanos: priced })).not.toThrow();
	});
});

describe("ElevenLabs Scribe Live relay", () => {
	it("opens the socket at the first audio chunk with the client's settings, then sends the held audio", async () => {
		vi.useFakeTimers();
		const { object, fetch, upstream } = relay();
		await object.connectProvider();
		expect(fetch).not.toHaveBeenCalled();
		expect(object.providerSetupComplete).toBe(true);
		await object.handleClientMessage(JSON.stringify({ type: "session.update", session: { ...allSettings, language: "en", previous_text: "A short test recording." } }));
		expect(sentOfType(object, "session.updated")).toHaveLength(1);
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: chunk }));
		await vi.advanceTimersByTimeAsync(0);
		const [url, init] = fetch.mock.calls[0];
		expect(url.startsWith("https://api.elevenlabs.io/v1/speech-to-text/realtime?")).toBe(true);
		expect(Object.fromEntries(new URL(url).searchParams)).toMatchObject({ model_id: "scribe_v3_live", audio_format: "pcm_16000",
			commit_strategy: "vad", language_code: "en", diarize: "true", include_timestamps: "true" });
		expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("test");
		// Held until session_started; nothing billed yet.
		await vi.advanceTimersByTimeAsync(100);
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: chunk }));
		expect(upstream.send).not.toHaveBeenCalled();
		expect(object.usage.input_audio_ms).toBeUndefined();
		await play(object, [started]);
		await vi.advanceTimersByTimeAsync(0);
		expect(sentOfType(object, "session.created")).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(100);
		await speak(object, 1);
		const chunks = upstreamSent(upstream);
		expect(chunks).toHaveLength(3);
		expect(chunks[0]).toEqual({ message_type: "input_audio_chunk", audio_base_64: chunk, commit: false, sample_rate: 16_000,
			previous_text: "A short test recording." });
		expect(chunks.slice(1).every((message: any) => !("previous_text" in message))).toBe(true);
		expect(object.usage.input_audio_ms).toBe(300);
		// ElevenLabs' raw events never reach the client.
		expect(sent(object).some((event: any) => "message_type" in event)).toBe(false);
	});

	it("refuses settings once audio has started, and paid add-ons at any time", async () => {
		vi.useFakeTimers();
		const { object } = await streaming(null, 1);
		await object.handleClientMessage(JSON.stringify({ type: "session.update", session: { language: "fr" } }));
		await object.handleClientMessage(JSON.stringify({ type: "session.update", session: { keyterms: ["Phaseo"] } }));
		expect(sentOfType(object, "relay.client_event_rejected")).toEqual([
			{ type: "relay.client_event_rejected", event_type: "session.update", reason: "realtime_session_update_not_accepted" },
			{ type: "relay.client_event_rejected", event_type: "session.update", reason: "realtime_transcription_option_not_supported", param: "keyterms" },
		]);
		expect(sentOfType(object, "session.updated")).toEqual([]);
	});

	it("commits on input_audio.commit only with at least 0.3 s of new audio", async () => {
		vi.useFakeTimers();
		const { object, upstream } = await streaming({ commit_strategy: "manual" }, 2);
		await object.handleClientMessage(JSON.stringify({ type: "input_audio.commit" }));
		expect(sentOfType(object, "relay.client_event_rejected")).toHaveLength(1);
		await speak(object, 2);
		await object.handleClientMessage(JSON.stringify({ type: "input_audio.commit" }));
		expect(upstreamSent(upstream).at(-1)).toEqual({ message_type: "input_audio_chunk", audio_base_64: "", commit: true, sample_rate: 16_000 });
	});

	it("on session.end waits for the transcript of a manual commit still outstanding", async () => {
		vi.useFakeTimers();
		const { object, upstream } = await streaming({ commit_strategy: "manual" }, 5);
		await object.handleClientMessage(JSON.stringify({ type: "input_audio.commit" }));
		const commits = () => upstreamSent(upstream).filter((message: any) => message.commit === true).length;
		expect(commits()).toBe(1);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		// Nothing new to commit, but the manual commit's transcript has not arrived yet.
		expect(commits()).toBe(1);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		expect(sentOfType(object, "transcription.done")).toEqual([]);
		await play(object, [{ message_type: "committed_transcript", text: "Hello there." }]);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(sentOfType(object, "transcription.done")).toEqual([
			{ type: "transcription.done", text: "Hello there.", segment_count: 1 },
		]);
	});

	it("keeps audio sent after an outstanding commit uncommitted when that commit's transcript arrives", async () => {
		vi.useFakeTimers();
		const { object, upstream } = await streaming({ commit_strategy: "manual" }, 5);
		await object.handleClientMessage(JSON.stringify({ type: "input_audio.commit" }));
		await speak(object, 4);
		await play(object, [{ message_type: "committed_transcript", text: "First." }]);
		// The 0.4 s sent after the first commit is still uncommitted.
		await object.handleClientMessage(JSON.stringify({ type: "input_audio.commit" }));
		expect(sentOfType(object, "relay.client_event_rejected")).toEqual([]);
		expect(upstreamSent(upstream).filter((message: any) => message.commit === true)).toHaveLength(2);
	});

	it("on session.end commits audio sent after an acknowledged manual commit and waits for it", async () => {
		vi.useFakeTimers();
		const { object, upstream } = await streaming({ commit_strategy: "manual" }, 5);
		await object.handleClientMessage(JSON.stringify({ type: "input_audio.commit" }));
		await speak(object, 4);
		await play(object, [{ message_type: "committed_transcript", text: "First." }]);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(upstreamSent(upstream).filter((message: any) => message.commit === true)).toHaveLength(2);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await play(object, [{ message_type: "committed_transcript", text: "Second." }]);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(sentOfType(object, "transcription.done")[0]).toMatchObject({ text: "First. Second.", segment_count: 2 });
	});

	it("on session.end commits the rest, sends transcription.done after the last follow-up, then settles once", async () => {
		vi.useFakeTimers();
		const { object, upstream } = await streaming(allSettings, 20);
		await play(object, beforeEnd.map((entry) => entry.event!));
		await speak(object, 5);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(upstreamSent(upstream).at(-1)).toEqual({ message_type: "input_audio_chunk", audio_base_64: "", commit: true, sample_rate: 16_000 });
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		// Recorded: two partials, the committed transcript, its timestamps, then its speaker labels.
		const answer = afterEnd.map((entry) => entry.event!);
		expect(answer.map((event) => event.message_type).slice(-3))
			.toEqual(["committed_transcript", "committed_transcript_with_timestamps", "diarized_transcript"]);
		await play(object, answer.slice(0, -1));
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await play(object, answer.slice(-1));
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "completed", disconnectReason: "client_requested_end", usage: { input_audio_ms: 2_500 },
		});
		const types = sent(object).map((event: any) => event.type);
		expect(types.indexOf("transcription.done")).toBeLessThan(types.indexOf("session.ended"));
		expect(sentOfType(object, "transcription.done")[0].text).toBe(ofType("committed_transcript").map((event) => event.text).join(" "));
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it("does not commit too little audio at the end: ElevenLabs would close the session", async () => {
		vi.useFakeTimers();
		const { object, upstream } = await streaming(allSettings, 20);
		await play(object, beforeEnd.map((entry) => entry.event!));
		await speak(object, 2);
		const before = upstream.send.mock.calls.length;
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(upstream.send.mock.calls.length).toBe(before);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(sentOfType(object, "transcription.done")).toHaveLength(1);
	});

	it("hides commit_throttled after its own final commit and settles when ElevenLabs closes", async () => {
		vi.useFakeTimers();
		const { object, listeners } = await streaming({}, 10);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		await play(object, [throttled]);
		expect(sentOfType(object, "error")).toEqual([]);
		listeners.close({ code: 1000, reason: "commit_throttled", wasClean: true });
		await vi.advanceTimersByTimeAsync(0);
		await object.upstreamEvents;
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ usage: { input_audio_ms: 1_000 } });
		expect(sentOfType(object, "transcription.done")).toHaveLength(1);
	});

	it("settles from metered audio if the final transcript never arrives", async () => {
		vi.useFakeTimers();
		const { object } = await streaming({}, 4);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			usage: { input_audio_ms: 400 }, disconnectReason: "client_requested_end_authoritative_usage_timeout",
		});
	});

	it("bills nothing when ElevenLabs refuses the connection", async () => {
		vi.useFakeTimers();
		const { object, fetch } = relay();
		fetch.mockImplementation(async () => ({ status: 401, text: async () => "unauthorized" }) as any);
		await object.connectProvider();
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: chunk }));
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "failed", disconnectReason: "realtime_provider_connection_failed" });
		expect(mocks.settleRealtimeSession.mock.calls[0][0].usage.input_audio_ms).toBeUndefined();
	});

	it("is healthy while it waits for the first audio chunk", async () => {
		const { object } = relay();
		await object.connectProvider();
		expect(object.upstream).toBeNull();
		expect(object.isHealthy()).toBe(true);
	});

	it("leaves the Eleven Realtime voice models on their own path", () => {
		const { object } = relay();
		object.session.model_id = "eleven-labs/eleven-realtime-v1-mini";
		object.session.provider_model_id = "eleven_realtime_v1_mini";
		expect(object.isScribe).toBe(false);
	});
});
