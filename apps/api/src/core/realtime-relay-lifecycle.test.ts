import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import { canonicalModel, providerFromModel } from "./realtime-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({})),
	markRealtimeSessionBillingUnresolved: vi.fn(async () => ({ session_id: "rt_test", status: "billing_unresolved" })),
	getRealtimeSessionForInternal: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionBillingUnresolved: mocks.markRealtimeSessionBillingUnresolved,
	getRealtimeSessionForInternal: mocks.getRealtimeSessionForInternal,
}));

const OPEN = 1;
const pcm = (ms: number, rate = 24_000, value = 0) => {
	const audio = Buffer.alloc(Math.round((rate * ms) / 1000) * 2);
	if (value) for (let i = 0; i < audio.length; i += 2) audio.writeInt16LE(value, i);
	return audio.toString("base64");
};

function fakeStorage(order?: string[]) {
	const data = new Map<string, unknown>();
	return {
		data,
		put: vi.fn(async (key: string | Record<string, unknown>, value?: unknown) => {
			order?.push("put");
			if (typeof key === "string") data.set(key, structuredClone(value));
			else for (const [entry, item] of Object.entries(key)) data.set(entry, structuredClone(item));
		}),
		get: vi.fn(async (key: string) => structuredClone(data.get(key))),
		setAlarm: vi.fn(async () => undefined),
		deleteAll: vi.fn(async () => data.clear()),
		deleteAlarm: vi.fn(async () => undefined),
	};
}

/** Relay with a fake storage and provider socket. `realSettle` keeps the real settle(). */
function relay(provider = "openai", options: { realSettle?: boolean; order?: string[] } = {}) {
	const storage = fakeStorage(options.order);
	const object = new RealtimeRelayDurableObject({ waitUntil: vi.fn(), storage } as any, {} as any) as any;
	object.session = {
		session_id: "rt_test",
		workspace_id: "workspace",
		key_id: "key",
		provider,
		model_id: provider === "google-ai-studio" ? "google/gemini-live" : `${provider}/voice`,
		metadata: {},
	};
	object.upstream = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.sendClientRaw = vi.fn((text: string) => options.order?.push(`forward:${JSON.parse(text).type ?? "event"}`));
	object.sendUpstream = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	object.emitTurnTelemetry = vi.fn(async () => undefined);
	object.resetIdleTimer = vi.fn();
	if (!options.realSettle) object.settle = vi.fn(async () => true);
	return object;
}

const upstreamTypes = (object: any) => object.sendUpstream.mock.calls.map(([payload]: [any]) => payload.type ?? Object.keys(payload)[0]);

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("Realtime relay lifecycle", () => {
	it.each(["google-ai-studio"])("does not reopen %s billing for microphone silence after a completed turn", async (provider) => {
		const object = relay(provider);
		object.providerSetupComplete = true;
		object.providerCompletedResponseSeen = true;
		const silence = Buffer.alloc(3200).toString("base64");
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: silence, rms: 1 }));
		// Forwarded to keep Google's connection open; never part of a billed turn.
		expect(object.sendUpstream).toHaveBeenCalledExactlyOnceWith({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: silence } } });
		expect(object.usage.input_audio_ms).toBeUndefined();
		expect(object.receivedAudioMs).toBe(100);
		expect(object.inputSinceLastResponse).toBe(false);
		await object.handleClientGone();
		expect(object.settle).toHaveBeenCalledWith("completed", "client_disconnected");
	});

	it.each(["openai", "spacex-ai"])("forwards quiet %s speech without an RMS gate", async (provider) => {
		const object = relay(provider);
		object.providerSetupComplete = true;
		const audio = pcm(100, 24_000, 100);
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio, rms: 0 }));
		expect(object.sendUpstream).toHaveBeenCalledWith({ type: "input_audio_buffer.append", audio });
	});

	it("does not mark uncommitted OpenAI microphone audio as pending billing", async () => {
		const object = relay();
		object.providerSetupComplete = true;
		for (let i = 0; i < 5; i++) {
			await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: pcm(100, 24_000, 3000) }));
		}
		expect(object.inputSinceLastResponse).toBe(false);
		expect(object.usage.input_audio_pending).toBeUndefined();
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.committed", item_id: "item_1" }));
		expect(object.inputSinceLastResponse).toBe(true);
		expect(object.usage.input_audio_pending).toBe(true);
	});

	it("settles a disconnect while the microphone is streaming without creating a response", async () => {
		vi.useFakeTimers();
		const object = relay("openai", { realSettle: true });
		object.providerSetupComplete = true;
		object.audioStartedAt = Date.now() - 10_000;
		for (let i = 0; i < 5; i++) {
			await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: pcm(200, 24_000, 3000) }));
		}
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_started", audio_start_ms: 0 }));
		await object.handleClientGone();
		expect(upstreamTypes(object)).not.toContain("response.create");
		expect(upstreamTypes(object)).not.toContain("input_audio_buffer.commit");
		expect(object.sendUpstream).toHaveBeenCalledWith({ type: "input_audio_buffer.clear" });
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.cleared" }));
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "cancelled", disconnectReason: "client_disconnected", estimated: false });
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it("still settles when OpenAI never acknowledges the buffer clear", async () => {
		vi.useFakeTimers();
		const object = relay("openai", { realSettle: true });
		object.receivedAudioMs = 3000;
		await object.handleClientGone();
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "cancelled",
			disconnectReason: "client_disconnected_authoritative_usage_timeout",
		});
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it.each([false, true])("waits for OpenAI to clear uncommitted audio after completed response=%s", async (completed) => {
		vi.useFakeTimers();
		const object = relay();
		object.receivedAudioMs = 3000;
		object.providerCompletedResponseSeen = completed;
		await object.handleClientGone();
		expect(object.settle).not.toHaveBeenCalled();
		expect(object.sendUpstream).toHaveBeenCalledWith({ type: "input_audio_buffer.clear" });
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.cleared" }));
		expect(object.settle).toHaveBeenCalledWith(completed ? "completed" : "cancelled", "client_disconnected");
	});

	it("does not settle a committed OpenAI turn when the trailing buffer is cleared", async () => {
		const object = relay();
		object.pendingSettlement = { status: "cancelled", reason: "client_disconnected", phase: "authoritative" };
		object.waitingForOpenAIInputClear = true;
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.committed" }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.cleared" }));
		expect(object.inputSinceLastResponse).toBe(true);
		expect(object.settle).not.toHaveBeenCalled();
	});

	it("cancels an in-flight OpenAI response on disconnect and settles from its final usage", async () => {
		vi.useFakeTimers();
		const object = relay("openai", { realSettle: true });
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_1" } }));
		await object.handleClientGone();
		expect(upstreamTypes(object)).toEqual(["response.cancel"]);
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_1", status: "cancelled",
			usage: { input_token_details: { audio_tokens: 40 }, output_token_details: { audio_tokens: 12 } } } }));
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "completed",
			disconnectReason: "client_disconnected",
			estimated: false,
			usage: { input_audio_tokens: 40, output_audio_tokens: 12 },
		});
	});

	it("cancels a response the provider creates after the client disconnected", async () => {
		vi.useFakeTimers();
		const object = relay();
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.committed" }));
		await object.handleClientGone();
		expect(object.settle).not.toHaveBeenCalled();
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_2" } }));
		expect(upstreamTypes(object)).toContain("response.cancel");
		expect(upstreamTypes(object)).not.toContain("response.create");
	});

	it("routes rejected audio through the drain instead of settling over an in-flight response", async () => {
		vi.useFakeTimers();
		const object = relay();
		object.providerSetupComplete = true;
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_3" } }));
		await object.handleClientMessage("x".repeat(97 * 1024));
		expect(object.acceptingAudio).toBe(false);
		expect(object.sendClientRaw).toHaveBeenCalledWith(JSON.stringify({ type: "relay.input_rejected", reason: "realtime_audio_message_too_large" }));
		expect(object.settle).not.toHaveBeenCalled();
		expect(upstreamTypes(object)).toContain("response.cancel");
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_3", usage: { output_token_details: { audio_tokens: 4 } } } }));
		expect(object.settle).toHaveBeenCalledWith("failed", "realtime_audio_message_too_large");
	});

	it("settles rejected audio immediately when nothing is in flight", async () => {
		const object = relay("openai", { realSettle: true });
		await object.rejectAudio("realtime_audio_rate_exceeded");
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "failed", disconnectReason: "realtime_audio_rate_exceeded" });
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it("journals usage-bearing provider events before forwarding them", async () => {
		const order: string[] = [];
		const object = relay("openai", { order });
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_4" } }));
		expect(order).toEqual(["put", "forward:response.created"]);
		order.length = 0;
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_4", usage: { output_token_details: { audio_tokens: 9 } } } }));
		expect(order.indexOf("put")).toBeGreaterThanOrEqual(0);
		expect(order.indexOf("put")).toBeLessThan(order.indexOf("forward:response.done"));
		expect(object.state.storage.data.get("usage")).toMatchObject({ output_audio_tokens: 9 });
		expect(object.state.storage.data.get("usage").assistant_response_in_flight).toBeUndefined();
		order.length = 0;
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.output_text.delta", delta: "hi" }));
		expect(order).toEqual(["forward:response.output_text.delta"]);
	});

	it("completes an OpenAI response without usage using a metered estimate", async () => {
		const object = relay();
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_started", audio_start_ms: 1000 }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_stopped", audio_end_ms: 2700 }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.committed" }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_5" } }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.output_audio.delta", delta: pcm(500) }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_5", status: "completed" } }));
		expect(object.responseInFlight).toBe(false);
		expect(object.inputSinceLastResponse).toBe(false);
		// 1.7 s speech + 0.3 s prefix at 10 tokens/s; 0.5 s output at 20 tokens/s.
		expect(object.usage).toMatchObject({ input_audio_tokens: 20, output_audio_tokens: 10, billing_estimated: true,
			estimate_basis: "openai_response_usage_missing" });
	});

	it("estimates a usage-less response without billing a turn committed after it twice", async () => {
		const object = relay();
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_started", audio_start_ms: 1000 }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_stopped", audio_end_ms: 2700 }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.committed" }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_a" } }));
		// The caller speaks again while the first reply is still in flight.
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_started", audio_start_ms: 3000 }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.speech_stopped", audio_end_ms: 4000 }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "input_audio_buffer.committed" }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_a", status: "completed" } }));
		// Only the first turn (1.7 s + 0.3 s prefix) is estimated; the second stays pending.
		expect(object.usage).toMatchObject({ input_audio_tokens: 20, estimated_input_audio_tokens: 20, input_audio_pending: true });
		expect(object.inputSinceLastResponse).toBe(true);
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_b" } }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_b", usage: { input_token_details: { audio_tokens: 13 } } } }));
		expect(object.usage.input_audio_tokens).toBe(33);
		expect(object.inputSinceLastResponse).toBe(false);
		expect(object.usage.pending_vad_input_audio_ms).toBeUndefined();
	});

	it("does not forward a billing event whose journal write failed", async () => {
		const order: string[] = [];
		const object = relay("openai", { order });
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_j" } }));
		order.length = 0;
		object.state.storage.put.mockRejectedValueOnce(new Error("storage unavailable"));
		await expect(object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_j", usage: { output_token_details: { audio_tokens: 9 } } } }))).rejects.toThrow("storage unavailable");
		expect(order).not.toContain("forward:response.done");
		// The in-memory usage the queue's error handler settles from still has the event.
		expect(object.usage.output_audio_tokens).toBe(9);
	});

	it("restores the completed-response flag after eviction", async () => {
		const object = relay();
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_e" } }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "resp_e", usage: { output_token_details: { audio_tokens: 4 } } } }));
		const storage = object.state.storage;
		const restored = new RealtimeRelayDurableObject({ waitUntil: vi.fn(), storage } as any, {} as any) as any;
		mocks.getRealtimeSessionForInternal.mockResolvedValueOnce(object.session);
		await restored.restoreStateIfEvicted("rt_test");
		expect(restored.providerCompletedResponseSeen).toBe(true);
		expect(restored.pendingSettlementStatus({ status: "cancelled", reason: "client_disconnected", statusFromResponses: true })).toBe("completed");
	});

	it("settles an interrupted turn from confirmed usage plus an estimate instead of opening a review", async () => {
		const object = relay("openai", { realSettle: true });
		object.usage = { input_audio_tokens: 100, output_audio_tokens: 50 };
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.created", response: { id: "resp_6" } }));
		await object.handleUpstreamMessage(JSON.stringify({ type: "response.output_audio.delta", delta: pcm(1000) }));
		await object.handleUpstreamClose({ code: 1006, reason: "", wasClean: false });
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		const call = mocks.settleRealtimeSession.mock.calls[0][0] as any;
		expect(call).toMatchObject({ estimated: true, estimateBasis: "interrupted_turn_metered_audio" });
		expect(call.usage).toMatchObject({ input_audio_tokens: 100, output_audio_tokens: 70, estimated_output_audio_tokens: 20 });
		expect(call.usage.assistant_response_in_flight).toBeUndefined();
	});

	it("does not bill Google speech that no model turn followed", async () => {
		const object = relay("google-ai-studio", { realSettle: true });
		object.inputSinceLastResponse = true;
		object.usage = { input_audio_ms: 2000, pending_input_audio_ms: 2000, input_audio_pending: true };
		await object.settle("cancelled", "client_disconnected_authoritative_usage_timeout");
		const call = mocks.settleRealtimeSession.mock.calls[0][0] as any;
		expect(call.estimated).toBe(true);
		expect(call.usage.input_audio_tokens).toBe(0);
		expect(mocks.markRealtimeSessionBillingUnresolved).not.toHaveBeenCalled();
	});

	it("keeps actual Google speech pending even when the client claims silence", async () => {
		const object = relay("google-ai-studio");
		object.providerSetupComplete = true;
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: pcm(100, 16_000, 3000), rms: 0 }));
		expect(object.sendUpstream).toHaveBeenCalled();
		expect(object.inputSinceLastResponse).toBe(true);
		// The pending flag is journaled immediately, not on the 1 s checkpoint throttle.
		expect(object.state.storage.data.get("usage")).toMatchObject({ input_audio_pending: true });
		for (let i = 0; i < 10; i++) await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: pcm(100, 16_000) }));
		// Trailing silence is forwarded so Google's own VAD ends the turn.
		expect(object.sendUpstream).toHaveBeenLastCalledWith({ realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: pcm(100, 16_000) } } });
		expect(object.googleAudioActive).toBe(false);
		// Only a provider usage event may clear pending speech, not silence detection.
		expect(object.inputSinceLastResponse).toBe(true);
	});

	it.each(["generationComplete", "interrupted"])("waits for turnComplete after Google's %s signal", async (signal) => {
		const object = relay("google-ai-studio");
		object.client = {};
		const event = (value: unknown) => object.handleUpstreamMessage(JSON.stringify(value));
		const usageMetadata = { promptTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 20 }] };
		await event({ serverContent: { modelTurn: { parts: [{ text: "Hello" }] } }, usageMetadata });
		await event({ serverContent: { [signal]: true } });
		expect(object.providerState.googleTurnActive).toBe(true);
		expect(object.usage.output_audio_tokens).toBeUndefined();
		await event({ serverContent: { turnComplete: true }, usageMetadata });
		expect(object.usage).toMatchObject({ input_audio_tokens: 100, output_audio_tokens: 20 });
		expect(object.responseInFlight).toBe(false);
		expect(object.providerState.googleTurnActive).toBe(false);
		await event({ serverContent: { modelTurn: { parts: [{ text: "Again" }] } } });
		await event({ serverContent: { turnComplete: true }, usageMetadata });
		expect(object.usage).toMatchObject({ input_audio_tokens: 200, output_audio_tokens: 40 });
	});

	it("completes a Google turn whose usage has only image and video prompt tokens", async () => {
		const object = relay("google-ai-studio");
		object.client = {};
		object.checkpointUsage = vi.fn();
		object.persistUsage = vi.fn();
		object.persistProviderState = vi.fn();
		object.maybePersistProviderState = vi.fn();
		object.emitTurnTelemetry = vi.fn();
		const event = (value: unknown) => object.handleUpstreamMessage(JSON.stringify(value));
		const usageMetadata = { promptTokensDetails: [{ modality: "IMAGE", tokenCount: 258 }, { modality: "VIDEO", tokenCount: 300 }] };
		await event({ serverContent: { modelTurn: { parts: [] } }, usageMetadata });
		await event({ serverContent: { turnComplete: true }, usageMetadata });
		expect(object.usage).toMatchObject({ input_image_tokens: 258, input_video_tokens: 300 });
		expect(object.providerState.googleTurnActive).toBe(false);
	});

	it("ends Google's microphone stream immediately on disconnect and drains final usage", async () => {
		vi.useFakeTimers();
		const object = relay("google-ai-studio");
		object.inputSinceLastResponse = true;
		await object.handleClientGone();
		expect(object.sendUpstream).toHaveBeenCalledWith({ realtimeInput: { audioStreamEnd: true } });
		expect(object.settle).not.toHaveBeenCalled();
	});

	it("bills xAI server VAD sessions by connected wall-clock time and passes provider cost as a floor", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-21T10:00:00Z"));
		const object = relay("spacex-ai", { realSettle: true });
		object.usage = {
			provider_connected_at_ms: Date.now(),
			input_audio_ms: 90_000,
			output_audio_ms: 30_000,
			audio_ms: 120_000,
		};
		vi.setSystemTime(new Date("2026-10-21T10:01:30Z"));
		await object.settle("completed", "client_disconnected");
		const call = mocks.settleRealtimeSession.mock.calls[0][0] as any;
		expect(call.usage).toMatchObject({ session_audio_ms: 90_000, audio_ms: 90_000 });
		expect(call.providerCostNanos).toBeUndefined();

		const priced = relay("spacex-ai", { realSettle: true });
		priced.usage = { provider_connected_at_ms: Date.now() - 1000 };
		await priced.handleUpstreamMessage(JSON.stringify({ type: "response.done", response: { id: "x1", usage: { cost_in_usd_ticks: 80_000_000 } } }));
		await priced.settle("completed", "client_disconnected");
		expect((mocks.settleRealtimeSession.mock.calls[1][0] as any).providerCostNanos).toBe(8_000_000);
	});

	it("does not overwrite live in-memory usage with an older storage checkpoint on alarm", async () => {
		const object = relay();
		object.client = { readyState: OPEN };
		object.usage = { input_audio_tokens: 500 };
		await object.state.storage.put({ session_id: "rt_test", usage: { input_audio_tokens: 100 } });
		await object.alarm();
		expect(mocks.getRealtimeSessionForInternal).not.toHaveBeenCalled();
		expect(object.acceptingAudio).toBe(false);
		expect(object.usage.input_audio_tokens).toBe(500);
		expect(object.settle).toHaveBeenCalledWith("expired", "realtime_max_duration");
	});

	it("restores storage after an eviction on alarm", async () => {
		const object = relay();
		object.session = null;
		object.usage = {};
		object.upstream = null;
		mocks.getRealtimeSessionForInternal.mockResolvedValue({ session_id: "rt_test", provider: "openai", usage: {} });
		await object.state.storage.put({ session_id: "rt_test", usage: { input_audio_tokens: 100, assistant_response_in_flight: true } });
		await object.alarm();
		expect(object.usage.input_audio_tokens).toBe(100);
		expect(object.responseInFlight).toBe(true);
		// The provider socket died with the eviction, so settle (with an estimate) now.
		expect(object.settle).toHaveBeenCalledWith("expired", "realtime_max_duration");
	});

	it("never sends an extra billed closing response when the budget runs out", async () => {
		const object = relay();
		await object.beginBudgetClose("realtime_budget_threshold");
		expect(upstreamTypes(object)).not.toContain("response.create");
		expect(object.settle).toHaveBeenCalledWith("expired", "realtime_budget_threshold");

		const busy = relay("spacex-ai");
		busy.responseInFlight = true;
		await busy.beginBudgetClose("realtime_budget_threshold");
		expect(upstreamTypes(busy)).not.toContain("response.create");
	});

	it("reports a connected relay with recent traffic as healthy to reconciliation", async () => {
		const object = relay();
		object.client = { readyState: OPEN };
		object.lastActivityAt = Date.now();
		await object.state.storage.put("session_id", "rt_test");
		const response = await object.reconcile("rt_test");
		expect(await response.json()).toEqual({ active: true, settled: false, healthy: true });
		expect(object.settle).not.toHaveBeenCalled();
	});

	it("moves to billing review after repeated settlement failures instead of retrying forever", async () => {
		const object = relay("openai", { realSettle: true });
		mocks.settleRealtimeSession.mockRejectedValueOnce(new Error("network"));
		await object.state.storage.put("settlement_attempts", 19);
		await object.settle("completed", "client_disconnected");
		expect(mocks.markRealtimeSessionBillingUnresolved).toHaveBeenCalledOnce();
		expect((mocks.markRealtimeSessionBillingUnresolved.mock.calls[0][0] as any).reason).toBe("realtime_settlement_retry_exhausted");
	});

	it.each(["x-ai", "xai", "spacex-ai"])("uses the current catalogue identity for %s", (alias) => {
		const provider = providerFromModel(`${alias}/grok-voice-think-fast-2.0`, alias);
		expect(provider).toBe("spacex-ai");
		expect(canonicalModel(provider!, `${alias}/grok-voice-think-fast-2.0`)).toBe("spacex-ai/grok-voice-think-fast-2.0");
	});

	it.each([true, false])("records a disconnected session with completed response=%s", async (completed) => {
		const object = relay();
		object.providerCompletedResponseSeen = completed;
		await object.handleClientGone();
		expect(object.settle).toHaveBeenCalledWith(completed ? "completed" : "cancelled", "client_disconnected");
	});

	it("waits for final usage persistence before handling a provider close", async () => {
		const object = relay();
		const order: string[] = [];
		let release!: () => void;
		const persisted = new Promise<void>((resolve) => { release = resolve; });
		object.queueUpstreamEvent(async () => { order.push("usage"); await persisted; order.push("persisted"); });
		object.queueUpstreamEvent(async () => { order.push("close"); });
		await Promise.resolve();
		expect(order).toEqual(["usage"]);
		release();
		await object.upstreamEvents;
		expect(order).toEqual(["usage", "persisted", "close"]);
	});

	it("releases a failed setup without accepting or billing microphone audio", async () => {
		const object = relay();
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: Buffer.alloc(480).toString("base64") }));
		expect(object.usage.input_audio_ms).toBeUndefined();
		await object.handleUpstreamMessage(JSON.stringify({ type: "error", error: { code: "invalid_voice" } }));
		expect(object.settle).toHaveBeenCalledWith("failed", "provider_session_setup_failed");
	});

	it.each([["openai", { type: "session.updated" }], ["x-ai", { type: "session.updated" }], ["google-ai-studio", { setupComplete: {} }]])("recognizes %s setup acknowledgement", async (provider, event) => {
		const object = relay(provider as string);
		await object.handleUpstreamMessage(JSON.stringify(event));
		expect(object.providerSetupComplete).toBe(true);
		expect(object.settle).not.toHaveBeenCalled();
	});
});
