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
