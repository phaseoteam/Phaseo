import { describe, expect, it, vi } from "vitest";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import { canonicalModel, providerFromModel } from "./realtime-sessions";

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));

function relay(provider = "openai") {
	const object = new RealtimeRelayDurableObject({ waitUntil: vi.fn() } as any, {} as any) as any;
	object.session = { session_id: "rt_test", provider };
	object.sendClientRaw = vi.fn();
	object.settle = vi.fn(async () => true);
	return object;
}

describe("Realtime relay lifecycle", () => {
	it("does not reopen billing for microphone silence after a completed Google turn", async () => {
		const object = relay("google-ai-studio");
		object.providerSetupComplete = true;
		object.upstream = { readyState: 1, bufferedAmount: 0 };
		object.checkpointUsage = vi.fn();
		object.maybePersistUsage = vi.fn();
		object.resetIdleTimer = vi.fn();
		object.sendUpstream = vi.fn();
		object.providerCompletedResponseSeen = true;
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: Buffer.alloc(3200).toString("base64"), rms: 1 }));
		expect(object.sendUpstream).not.toHaveBeenCalled();
		expect(object.inputSinceLastResponse).toBe(false);
		await object.handleClientGone();
		expect(object.settle).toHaveBeenCalledWith("completed", "client_disconnected");
	});

	it("keeps actual Google speech pending even when the client claims silence", async () => {
		const object = relay("google-ai-studio");
		object.providerSetupComplete = true;
		object.upstream = { readyState: 1, bufferedAmount: 0 };
		object.checkpointUsage = vi.fn(); object.maybePersistUsage = vi.fn();
		object.resetIdleTimer = vi.fn(); object.sendUpstream = vi.fn();
		const audio = Buffer.alloc(3200); for (let i = 0; i < audio.length; i += 2) audio.writeInt16LE(3000, i);
		await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: audio.toString("base64"), rms: 0 }));
		expect(object.sendUpstream).toHaveBeenCalled();
		expect(object.inputSinceLastResponse).toBe(true);
		for (let i = 0; i < 10; i++) await object.handleClientMessage(JSON.stringify({ type: "client.audio", audio: Buffer.alloc(3200).toString("base64") }));
		expect(object.sendUpstream).toHaveBeenLastCalledWith({ realtimeInput: { audioStreamEnd: true } });
		// Only a provider usage event may clear pending speech, not silence detection.
		expect(object.inputSinceLastResponse).toBe(true);
	});

	it.each(["generationComplete", "interrupted"])("waits for turnComplete after Google's %s signal", async (signal) => {
		const object = relay("google-ai-studio");
		object.client = {};
		object.checkpointUsage = vi.fn();
		object.persistUsage = vi.fn();
		object.persistProviderState = vi.fn();
		object.maybePersistProviderState = vi.fn();
		object.emitTurnTelemetry = vi.fn();
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

	it("ends Google's microphone stream immediately on disconnect and drains final usage", async () => {
		vi.useFakeTimers();
		try {
			const object = relay("google-ai-studio");
			object.state.storage = { put: vi.fn(), setAlarm: vi.fn() };
			object.checkpointUsage = vi.fn();
			object.sendUpstream = vi.fn();
			object.inputSinceLastResponse = true;
			await object.handleClientGone();
			expect(object.sendUpstream).toHaveBeenCalledWith({ realtimeInput: { audioStreamEnd: true } });
			expect(object.settle).not.toHaveBeenCalled();
		} finally { vi.clearAllTimers(); vi.useRealTimers(); }
	});

	it.each(["x-ai", "xai", "spacex-ai"])("uses the current catalogue identity for %s", (alias) => {
		const provider = providerFromModel(`${alias}/grok-voice-think-fast-2.0`, alias);
		expect(provider).toBe("spacex-ai");
		expect(canonicalModel(provider!, `${alias}/grok-voice-think-fast-2.0`)).toBe("spacex-ai/grok-voice-think-fast-2.0");
	});
	it.each([true, false])("records a disconnected session with completed response=%s", async (completed) => {
		const object = relay();
		object.checkpointUsage = vi.fn();
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
		object.maybePersistProviderState = vi.fn();
		object.maybeCompleteGoogleTurn = vi.fn();
		await object.handleUpstreamMessage(JSON.stringify(event));
		expect(object.providerSetupComplete).toBe(true);
		expect(object.settle).not.toHaveBeenCalled();
	});
});
