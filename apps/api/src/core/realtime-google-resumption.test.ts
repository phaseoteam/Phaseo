import { afterEach, describe, expect, it, vi } from "vitest";
import recording from "./__fixtures__/realtime/google-live-goaway-resume.json";
import { GOOGLE_INPUT_IDLE_WARNING_MS, RealtimeRelayDurableObject, googleUsageSnapshot } from "./realtime-relay-durable-object";
import { buildGoogleBidiGenerateContentSetup, GOOGLE_REALTIME_MAX_DURATION_SECONDS } from "./realtime-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({
		session: { final_cost_nanos: 9_000 },
		settlement: { final_cost_nanos: 9_000, debt_nanos: 0, uncollected_nanos: 0 },
	})),
	markRealtimeSessionBillingUnresolved: vi.fn(async () => ({ session_id: "rt_test", status: "billing_unresolved" })),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionBillingUnresolved: mocks.markRealtimeSessionBillingUnresolved,
}));

const OPEN = 1;
const CLOSED = 3;

type FakeSocket = { readyState: number; bufferedAmount: number; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> };
const fakeSocket = (): FakeSocket => ({ readyState: OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn(), addEventListener: vi.fn() });

function fakeStorage() {
	const data = new Map<string, unknown>();
	return {
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
}

/**
 * A connected Google relay on a fake first connection. Resumed connections
 * come from `opens`: a socket, or an Error for a failed connect.
 */
function relay(opens: Array<FakeSocket | Error | Promise<FakeSocket>> = []) {
	const object = new RealtimeRelayDurableObject({ waitUntil: vi.fn(), storage: fakeStorage() } as any, {} as any) as any;
	object.session = {
		session_id: "rt_test",
		workspace_id: "workspace",
		key_id: "key",
		source: "api",
		provider: "google-ai-studio",
		model_id: "google/gemini-3.1-flash-live-preview",
		metadata: {},
		reserved_nanos: 5_000_000_000,
		estimated_cost_nanos: 0,
	};
	const first = fakeSocket();
	object.upstream = first;
	object.client = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.claimedAtMs = Date.now() - 1_000;
	object.sendClientRaw = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	object.emitTurnTelemetry = vi.fn(async () => undefined);
	object.openGoogleSocket = vi.fn(async (handle: string | null) => {
		const next = opens.shift();
		if (!next) throw new Error("no socket");
		if (next instanceof Error) throw next;
		const socket = await next;
		if (handle !== null) object.resumeSocket = socket;
		return socket;
	});
	return { object, first };
}

const sent = (object: any) => object.sendClientRaw.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sentOfType = (object: any, type: string) => sent(object).filter((event: any) => event.type === type);
const sentTo = (socket: FakeSocket) => socket.send.mock.calls.map(([text]: [string]) => JSON.parse(text));
const play = async (object: any, events: Array<{ event: unknown }>, socket?: FakeSocket) => {
	for (const { event } of events) await object.handleUpstreamMessage(JSON.stringify(event), socket);
};
const close = (object: any, socket: FakeSocket, frame: { code: number; reason: string; wasClean: boolean }) => {
	socket.readyState = CLOSED;
	return object.handleUpstreamClose(frame, socket);
};
const silence = (ms: number) => Buffer.alloc((16_000 * 2 * ms) / 1000).toString("base64");
const speech = (ms: number) => {
	const audio = Buffer.alloc((16_000 * 2 * ms) / 1000);
	for (let i = 0; i < audio.length; i += 2) audio.writeInt16LE(3000, i);
	return audio.toString("base64");
};
const clientAudio = (object: any, audio: string) => object.handleClientMessage(JSON.stringify({ type: "client.audio", audio }));

const firstTurn = { input_text_tokens: 154, input_audio_tokens: 259, output_audio_tokens: 58 };
const resumedTurn = { input_text_tokens: 183, input_audio_tokens: 317, output_audio_tokens: 38 };

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("Google usage", () => {
	it("bills prompt tokens Google reports without a modality as text", () => {
		// Recorded: promptTokenCount 413, details TEXT 134 + AUDIO 259.
		const usage = recording.first_connection.find((entry: any) => entry.event.usageMetadata)!.event as any;
		expect(googleUsageSnapshot(usage.usageMetadata)).toMatchObject(firstTurn);
	});

	it("asks for resumption handles only on relay connections", () => {
		expect(buildGoogleBidiGenerateContentSetup({ model: "m" })).not.toHaveProperty("sessionResumption");
		expect(buildGoogleBidiGenerateContentSetup({ model: "m", resumptionHandle: null }).sessionResumption).toEqual({});
		expect(buildGoogleBidiGenerateContentSetup({ model: "m", resumptionHandle: "h" }).sessionResumption).toEqual({ handle: "h" });
	});

	it("allows a one hour call now that connections are resumed", () => {
		expect(GOOGLE_REALTIME_MAX_DURATION_SECONDS).toBe(60 * 60);
	});
});

describe("Google goAway reconnect (recorded 2026-10-22)", () => {
	it("moves the call to a resumed connection and sums usage across both", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		await play(object, recording.first_connection, first);
		expect(object.usage).toMatchObject(firstTurn);
		// goAway and handles stay inside the relay; no warning since the call carries on.
		expect(sent(object).some((event: any) => event.goAway || event.sessionResumptionUpdate)).toBe(false);
		expect(sentOfType(object, "session.warning")).toHaveLength(0);
		expect(object.openGoogleSocket).toHaveBeenCalledExactlyOnceWith("handle-first-b");
		await object.resumeTask;

		await play(object, recording.resumed_connection.slice(0, 1), resumed);
		expect(object.upstream).toBe(resumed);
		expect(first.close).toHaveBeenCalledWith(1000, "realtime_relay_resumed");
		expect(sentOfType(object, "relay.provider_reconnected")).toEqual([expect.objectContaining({ reconnects: 1 })]);
		// The client already saw the first setupComplete.
		expect(sent(object).filter((event: any) => event.setupComplete)).toHaveLength(1);

		// The old connection's close after the switch does not end the call.
		await close(object, first, recording.first_connection_close);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();

		// The resumed turn re-bills the carried context (audio prompt 259 + 58 = 317).
		await play(object, recording.resumed_connection.slice(1), resumed);
		const total = {
			input_text_tokens: firstTurn.input_text_tokens + resumedTurn.input_text_tokens,
			input_audio_tokens: firstTurn.input_audio_tokens + resumedTurn.input_audio_tokens,
			output_audio_tokens: firstTurn.output_audio_tokens + resumedTurn.output_audio_tokens,
		};
		expect(object.usage).toMatchObject(total);

		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "completed",
			disconnectReason: "client_requested_end",
			estimated: false,
			usage: { ...total, provider_reconnects: 1 },
		});
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ reason: "client_requested", billing_status: "settled" })]);
	});

	it("waits for a running turn to finish before switching", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		await play(object, recording.first_connection.slice(0, 5), first);
		await object.handleUpstreamMessage(JSON.stringify({ goAway: { timeLeft: "50s" } }), first);
		expect(object.openGoogleSocket).not.toHaveBeenCalled();
		await play(object, recording.first_connection.slice(5, 6), first);
		expect(object.openGoogleSocket).toHaveBeenCalledExactlyOnceWith("handle-first-a");
		expect(object.usage).toMatchObject(firstTurn);
	});

	it("bills a turn cut off by Google's close from metered audio, then resumes", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		await play(object, recording.first_connection.slice(0, 7), first);
		// A second turn is running when goAway arrives and Google closes the connection.
		await object.handleUpstreamMessage(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: Buffer.alloc(48_000).toString("base64") } }] } } }), first);
		await object.handleUpstreamMessage(JSON.stringify({ goAway: { timeLeft: "50s" } }), first);
		expect(object.openGoogleSocket).not.toHaveBeenCalled();
		await close(object, first, recording.first_connection_close);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		// 1 s of output at 32 tokens/s, estimated because its usage can no longer arrive.
		expect(object.usage).toMatchObject({ output_audio_tokens: 58 + 32, estimated_output_audio_tokens: 32, billing_estimated: true,
			estimate_basis: "google_resumption_interrupted_turn" });
		expect(object.openGoogleSocket).toHaveBeenCalledExactlyOnceWith("handle-first-b");
		await object.resumeTask;
		await play(object, recording.resumed_connection, resumed);
		expect(object.upstream).toBe(resumed);
		expect(object.usage.output_audio_tokens).toBe(58 + 32 + 38);
		expect(sentOfType(object, "relay.upstream_closed")).toHaveLength(0);
	});

	it("holds client audio during the switch and sends it on the new connection", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		object.providerSetupComplete = true;
		object.audioStartedAt = Date.now() - 60_000;
		await play(object, recording.first_connection, first);
		await object.resumeTask;
		first.readyState = CLOSED;
		await clientAudio(object, silence(100));
		await clientAudio(object, speech(100));
		expect(sentOfType(object, "relay.input_rejected")).toHaveLength(0);
		expect(resumed.send).not.toHaveBeenCalled();
		await play(object, recording.resumed_connection.slice(0, 1), resumed);
		expect(sentTo(resumed).map((event: any) => Boolean(event.realtimeInput?.audio))).toEqual([true, true]);
		expect(object.acceptingAudio).toBe(true);
	});

	it("does not meter speech dropped past the switch buffer as billable input", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		object.providerSetupComplete = true;
		object.audioStartedAt = Date.now() - 60_000;
		await play(object, recording.first_connection, first);
		await object.resumeTask;
		delete object.usage.pending_input_audio_ms;
		for (let i = 0; i < 6; i += 1) await clientAudio(object, speech(1_000));
		// Five seconds fit in the buffer; the sixth never reaches Google.
		expect(object.usage.pending_input_audio_ms).toBe(5_000);
		expect(object.usage.resume_dropped_audio_ms).toBe(1_000);
		await play(object, recording.resumed_connection.slice(0, 1), resumed);
		expect(sentTo(resumed).filter((event: any) => event.realtimeInput?.audio)).toHaveLength(5);
	});

	it("ignores late frames from the connection it replaced", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		await play(object, recording.first_connection, first);
		await object.resumeTask;
		await play(object, recording.resumed_connection.slice(0, 1), resumed);
		expect(object.upstream).toBe(resumed);
		const usage = structuredClone(object.usage);
		const forwarded = sent(object).length;
		await object.handleUpstreamMessage(JSON.stringify({ goAway: { timeLeft: "1s" } }), first);
		await object.handleUpstreamMessage(JSON.stringify({ serverContent: { turnComplete: true }, usageMetadata: { promptTokenCount: 50, responseTokenCount: 10 } }), first);
		expect(object.openGoogleSocket).toHaveBeenCalledOnce();
		expect(sent(object)).toHaveLength(forwarded);
		expect(object.usage).toEqual(usage);
	});

	it("warns and ends with the connection when resumption fails while it is still open", async () => {
		const { object, first } = relay([new Error("upstream_http_503"), new Error("upstream_http_503")]);
		await play(object, recording.first_connection, first);
		await object.resumeTask;
		await object.resumeTask;
		expect(object.openGoogleSocket).toHaveBeenCalledTimes(2);
		expect(sentOfType(object, "session.warning")).toEqual([expect.objectContaining({ code: "provider_closing" })]);
		await close(object, first, recording.first_connection_close);
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "completed", disconnectReason: "provider_socket_closed",
			usage: { ...firstTurn, provider_resume_failures: 2 } });
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ reason: "provider_closed", provider_close_code: 1008, billing_status: "settled" })]);
	});

	it("ends as provider_closed when the resumed connection never sets up after Google closed", async () => {
		vi.useFakeTimers();
		const a = fakeSocket();
		const b = fakeSocket();
		const { object, first } = relay([a, b]);
		await object.handleUpstreamMessage(JSON.stringify({ setupComplete: {} }), first);
		object.providerEventSeen = true;
		await play(object, recording.first_connection.slice(1, 6), first);
		await object.handleUpstreamMessage(JSON.stringify({ sessionResumptionUpdate: { newHandle: "h", resumable: false } }), first);
		await object.handleUpstreamMessage(JSON.stringify({ goAway: { timeLeft: "50s" } }), first);
		await close(object, first, recording.first_connection_close);
		await object.resumeTask;
		await close(object, a, { code: 1011, reason: "", wasClean: false });
		await object.resumeTask;
		await vi.advanceTimersByTimeAsync(10_000);
		await object.upstreamEvents;
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "completed", disconnectReason: "provider_socket_closed_resume_failed",
			usage: firstTurn });
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ reason: "provider_closed", initiated_by: "provider", provider_close_code: 1008 })]);
		expect(b.close).toHaveBeenCalled();
	});

	it("settles a client disconnect during the switch and discards the new connection", async () => {
		let release!: (socket: FakeSocket) => void;
		const pending = new Promise<FakeSocket>((resolve) => { release = resolve; });
		const resumed = fakeSocket();
		const { object, first } = relay([pending]);
		await play(object, recording.first_connection, first);
		await object.handleClientGone();
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "completed", disconnectReason: "client_disconnected", usage: firstTurn });
		release(resumed);
		await object.resumeTask;
		expect(resumed.close).toHaveBeenCalled();
		expect(object.upstream).toBeNull();
	});

	it("honours session.end while the resumed connection is setting up", async () => {
		const resumed = fakeSocket();
		const { object, first } = relay([resumed]);
		await play(object, recording.first_connection, first);
		await object.resumeTask;
		await object.handleClientMessage(JSON.stringify({ type: "session.end", reason: "bye" }));
		expect(resumed.close).toHaveBeenCalled();
		await play(object, recording.resumed_connection.slice(0, 1), resumed);
		expect(object.upstream).toBeNull();
		expect(sentOfType(object, "relay.provider_reconnected")).toHaveLength(0);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ reason: "client_requested", client_reason: "bye" })]);
	});

	it("drains a running turn on session.end without switching connections", async () => {
		vi.useFakeTimers();
		const { object, first } = relay([fakeSocket()]);
		await play(object, recording.first_connection.slice(0, 3), first);
		await object.handleUpstreamMessage(JSON.stringify({ goAway: { timeLeft: "50s" } }), first);
		await object.handleClientMessage(JSON.stringify({ type: "session.end" }));
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await play(object, recording.first_connection.slice(3, 6), first);
		expect(object.openGoogleSocket).not.toHaveBeenCalled();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ disconnectReason: "client_requested_end", usage: firstTurn, estimated: false });
	});
});

describe("Google input idle", () => {
	it("forwards microphone silence (keeping the connection open) without reopening billing", async () => {
		const { object, first } = relay();
		object.providerSetupComplete = true;
		object.providerCompletedResponseSeen = true;
		object.audioStartedAt = Date.now() - 10_000;
		await clientAudio(object, silence(100));
		expect(sentTo(first)).toEqual([{ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: silence(100) } } }]);
		expect(object.inputSinceLastResponse).toBe(false);
		expect(object.usage.input_audio_ms).toBeUndefined();
	});

	it("warns two minutes after the last client audio and reports Google's idle close as provider_closed", async () => {
		vi.useFakeTimers();
		const { object, first } = relay();
		object.providerSetupComplete = true;
		object.providerEventSeen = true;
		object.audioStartedAt = Date.now();
		object.resetGoogleIdleWarning();
		await vi.advanceTimersByTimeAsync(60_000);
		await clientAudio(object, silence(100));
		await vi.advanceTimersByTimeAsync(GOOGLE_INPUT_IDLE_WARNING_MS - 1);
		expect(sentOfType(object, "session.warning")).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(sentOfType(object, "session.warning")).toEqual([
			expect.objectContaining({ code: "provider_closing", threshold: "input_idle", seconds_remaining: 30 }),
		]);
		await close(object, first, recording.idle_connection_close);
		expect(object.openGoogleSocket).not.toHaveBeenCalled();
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({ reason: "provider_closed", provider_close_code: 1008 })]);
	});
});
