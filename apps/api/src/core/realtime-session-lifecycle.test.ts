import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimeRelayDurableObject, validateRealtimeAudioIngress } from "./realtime-relay-durable-object";
import { computeRealtimeFundingPosition, REALTIME_MAX_OVERDRAFT_NANOS, realtimeUnheldCostNanos } from "./realtime-sessions";
import { classifyRealtimeEnd, REALTIME_END_REASONS } from "./realtime-session-events";
import { LIVE_PRICE_CARD, type LiveConfig } from "./live-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({
		session: { final_cost_nanos: 12_345_000 },
		settlement: { final_cost_nanos: 12_345_000, debt_nanos: 0, uncollected_nanos: 0 },
	})),
	markRealtimeSessionBillingUnresolved: vi.fn(async () => ({ session_id: "rt_test", status: "billing_unresolved" })),
	getRealtimeSessionForInternal: vi.fn(),
	updateRealtimeSessionUsage: vi.fn(async (): Promise<any> => null),
	extendRealtimeSessionHold: vi.fn(),
	getRealtimeFundingPosition: vi.fn(),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionBillingUnresolved: mocks.markRealtimeSessionBillingUnresolved,
	getRealtimeSessionForInternal: mocks.getRealtimeSessionForInternal,
	updateRealtimeSessionUsage: mocks.updateRealtimeSessionUsage,
	extendRealtimeSessionHold: mocks.extendRealtimeSessionHold,
	getRealtimeFundingPosition: mocks.getRealtimeFundingPosition,
}));

const OPEN = 1;
const MINUTE = 60_000;

const liveConfig: LiveConfig = { backendModel: "openai/gpt-5.6-luna", voiceCard: LIVE_PRICE_CARD,
	backendCard: { ...LIVE_PRICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules: [
		["input_text_tokens", "1"], ["output_text_tokens", "10"],
	].map(([meter, price]) => ({ ...LIVE_PRICE_CARD.rules[0], meter: meter as any, unit: "token", unit_size: 1_000_000, price_per_unit: price })) } };

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

type RelayOptions = { source?: "api" | "chat"; model?: string; live?: boolean };

/** A connected relay with fake sockets; settle() is real and settlement is mocked. */
function relay(provider = "openai", options: RelayOptions = {}) {
	const storage = fakeStorage();
	const object = new RealtimeRelayDurableObject({ waitUntil: vi.fn(), storage } as any, {} as any) as any;
	const model = options.model ?? (provider === "google-ai-studio" ? "google/gemini-live" : `${provider}/voice`);
	object.session = {
		session_id: "rt_test",
		workspace_id: "workspace",
		key_id: "key",
		source: options.source ?? "api",
		provider,
		model_id: model,
		metadata: options.live ? { live: liveConfig } : {},
		reserved_nanos: 5_000_000_000,
		estimated_cost_nanos: 4_500_000_000,
	};
	object.upstream = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.client = { readyState: OPEN, bufferedAmount: 0, close: vi.fn() };
	object.providerSetupComplete = true;
	object.claimedAtMs = Date.now() - 30_000;
	object.sendClientRaw = vi.fn();
	object.sendUpstream = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	object.emitTurnTelemetry = vi.fn(async () => undefined);
	return { object, storage };
}

const sent = (object: any) => object.sendClientRaw.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sentOfType = (object: any, type: string) => sent(object).filter((event: any) => event.type === type);
const ended = (object: any) => {
	const events = sentOfType(object, "session.ended");
	expect(events).toHaveLength(1);
	return events[0];
};
const upstreamTypes = (object: any) => object.sendUpstream.mock.calls.map(([payload]: [any]) => payload.type ?? Object.keys(payload)[0]);
const clientMessage = (object: any, payload: unknown) => object.handleClientMessage(JSON.stringify(payload));
const providerEvent = (object: any, payload: unknown) => object.handleUpstreamMessage(JSON.stringify(payload));

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("client session.end", () => {
	it("OpenAI: clears uncommitted audio, cancels the reply, settles from its usage, then sends session.ended and closes 1000", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai");
		const client = object.client;
		object.receivedAudioMs = 4_000;
		await providerEvent(object, { type: "response.created", response: { id: "resp_1" } });
		await clientMessage(object, { type: "session.end", reason: "user hung up" });
		expect(object.acceptingAudio).toBe(false);
		expect(upstreamTypes(object)).toEqual(["input_audio_buffer.clear", "response.cancel"]);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		// A cancelled response.done still carries usage.
		await providerEvent(object, { type: "response.done", response: { id: "resp_1", status: "cancelled",
			usage: { input_token_details: { audio_tokens: 40 }, output_token_details: { audio_tokens: 12 } } } });
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await providerEvent(object, { type: "input_audio_buffer.cleared" });
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({
			status: "completed",
			disconnectReason: "client_requested_end",
			estimated: false,
			usage: { input_audio_tokens: 40, output_audio_tokens: 12 },
		});
		const event = ended(object);
		expect(event).toMatchObject({
			type: "session.ended",
			session_id: "rt_test",
			reason: "client_requested",
			initiated_by: "client",
			client_reason: "user hung up",
			usage: { input_audio_tokens: 40, output_audio_tokens: 12 },
			cost: { total_nanos: 12_345_000, total_usd: 0.012345, estimated: false, debt_nanos: 0, uncollected_nanos: 0, currency: "USD" },
			billing_status: "settled",
		});
		expect(event.duration_seconds).toBeGreaterThanOrEqual(30);
		expect(event.final_bill).toBeUndefined();
		expect(client.close).toHaveBeenCalledWith(1000, "realtime_relay_settled");
	});

	it("OpenAI with cancel_response false lets the reply finish before settling", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai");
		await providerEvent(object, { type: "response.created", response: { id: "resp_2" } });
		await clientMessage(object, { type: "session.end", cancel_response: false });
		expect(upstreamTypes(object)).not.toContain("response.cancel");
		await providerEvent(object, { type: "response.done", response: { id: "resp_2", status: "completed",
			usage: { output_token_details: { audio_tokens: 30 } } } });
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(ended(object)).toMatchObject({ reason: "client_requested", billing_status: "settled" });
	});

	it("bounds the wait for a reply's usage and still ends", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai");
		await providerEvent(object, { type: "response.created", response: { id: "resp_3" } });
		await clientMessage(object, { type: "session.end" });
		await vi.advanceTimersByTimeAsync(10_000);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ estimated: true });
		expect(ended(object)).toMatchObject({ reason: "client_requested", cost: { estimated: true } });
	});

	it("Google: ends the microphone stream and settles once the turn completes", async () => {
		vi.useFakeTimers();
		const { object } = relay("google-ai-studio");
		object.googleAudioActive = true;
		const usageMetadata = { promptTokensDetails: [{ modality: "AUDIO", tokenCount: 64 }], responseTokensDetails: [{ modality: "AUDIO", tokenCount: 96 }] };
		await providerEvent(object, { serverContent: { modelTurn: { parts: [{ text: "Hello" }] } } });
		await clientMessage(object, { type: "session.end" });
		expect(object.sendUpstream).toHaveBeenCalledWith({ realtimeInput: { audioStreamEnd: true } });
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		await providerEvent(object, { serverContent: { turnComplete: true }, usageMetadata });
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(ended(object)).toMatchObject({ reason: "client_requested", usage: { input_audio_tokens: 64, output_audio_tokens: 96 } });
	});

	it("xAI: settles at once from connected time", async () => {
		const { object } = relay("spacex-ai");
		object.usage = { provider_connected_at_ms: Date.now() - 90_000 };
		object.receivedAudioMs = 1_000;
		await clientMessage(object, { type: "session.end" });
		expect(upstreamTypes(object)).toContain("input_audio_buffer.clear");
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(ended(object)).toMatchObject({ reason: "client_requested", initiated_by: "client", billing_status: "settled" });
		expect(ended(object).usage.audio_seconds).toBeGreaterThanOrEqual(90);
	});

	it("GPT Live: maps to session.close and settles from session.closed", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai", { source: "chat", model: "openai/gpt-live-1", live: true });
		object.usage = { live_started: true };
		await clientMessage(object, { type: "session.end" });
		expect(object.sendUpstream).toHaveBeenCalledExactlyOnceWith({ type: "session.close" });
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		// GPT Live reports wall-clock seconds on session.closed.
		await providerEvent(object, { type: "session.closed", usage: { seconds: 42 } });
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(ended(object)).toMatchObject({ reason: "client_requested", initiated_by: "client", usage: { audio_seconds: 42 } });
	});

	it("is idempotent", async () => {
		const { object } = relay("openai");
		await clientMessage(object, { type: "session.end" });
		await clientMessage(object, { type: "session.end" });
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		expect(sentOfType(object, "session.ended")).toHaveLength(1);
		expect(object.client).toBeNull();
	});
});

describe("session.ended on gateway and provider end paths", () => {
	it("is sent when the provider closes the socket, with its close code", async () => {
		const { object } = relay("google-ai-studio");
		object.providerEventSeen = true;
		object.providerCompletedResponseSeen = true;
		const client = object.client;
		await object.handleUpstreamClose({ code: 1008, reason: "idle", wasClean: true });
		expect(ended(object)).toMatchObject({ reason: "provider_closed", initiated_by: "provider", provider_close_code: 1008, billing_status: "settled" });
		expect(client.close).toHaveBeenCalledWith(1000, "realtime_relay_settled");
	});

	it("is sent when the key is revoked mid-call, which ends API calls too", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai", { source: "api" });
		delete object.persistUsage;
		mocks.updateRealtimeSessionUsage.mockResolvedValueOnce({ ...object.session, status: "ending", disconnect_reason: "realtime_key_revoked" });
		await providerEvent(object, { type: "response.created", response: { id: "resp_r" } });
		await object.persistUsage();
		expect(upstreamTypes(object)).toContain("response.cancel");
		await providerEvent(object, { type: "response.done", response: { id: "resp_r", usage: { output_token_details: { audio_tokens: 5 } } } });
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "cancelled", disconnectReason: "realtime_key_revoked" });
		expect(ended(object)).toMatchObject({ reason: "key_revoked", initiated_by: "gateway" });
	});

	it("is sent at the overdraft cap with reason insufficient_funds", async () => {
		const { object } = relay("openai", { source: "api" });
		mocks.extendRealtimeSessionHold.mockRejectedValue(new Error("insufficient_funds"));
		mocks.getRealtimeFundingPosition.mockResolvedValue({ overdraftUsedNanos: REALTIME_MAX_OVERDRAFT_NANOS, remainingNanos: 0, capReached: true });
		await object.enforceBudget(object.session);
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "expired", disconnectReason: "realtime_overdraft_cap_reached" });
		expect(ended(object)).toMatchObject({ reason: "insufficient_funds", initiated_by: "gateway" });
	});

	it("is sent at the provider cap", async () => {
		const { object, storage } = relay("openai");
		await storage.put("session_id", "rt_test");
		await object.alarm();
		expect(ended(object)).toMatchObject({ reason: "max_duration_reached", initiated_by: "gateway" });
	});

	it("reports a pending bill and where to fetch it when settlement must retry", async () => {
		const { object } = relay("openai");
		mocks.settleRealtimeSession.mockRejectedValueOnce(new Error("network"));
		const client = object.client;
		await object.settle("completed", "provider_socket_closed");
		expect(ended(object)).toMatchObject({
			reason: "provider_closed",
			billing_status: "pending",
			cost: { total_nanos: 4_500_000_000, estimated: true, estimate_basis: "running_estimate" },
			final_bill: { method: "GET", path: "/v1/generations?id=realtime%3Art_test" },
		});
		expect(client.close).toHaveBeenCalledWith(1000, "realtime_billing_pending");
		// The retry later settles without a second session.ended.
		await object.settle("completed", "provider_socket_closed");
		expect(mocks.settleRealtimeSession).toHaveBeenCalledTimes(2);
		expect(sentOfType(object, "session.ended")).toHaveLength(1);
	});

	it("reports an unresolved bill", async () => {
		const { object } = relay("openai");
		await object.markBillingUnresolved("live_authoritative_usage_pending");
		expect(ended(object)).toMatchObject({ billing_status: "unresolved", final_bill: { method: "GET" } });
	});
});

describe("idle handling", () => {
	it("never ends an API call for being idle", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai", { source: "api" });
		object.resetIdleTimer();
		await vi.advanceTimersByTimeAsync(30 * MINUTE);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		expect(object.idleTimer).toBeNull();
		// The reconciliation cron sees a quiet API call with open sockets as healthy.
		object.lastActivityAt = Date.now() - 30 * MINUTE;
		expect(object.isHealthy()).toBe(true);
	});

	it("still ends a playground call after five idle minutes", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai", { source: "chat" });
		object.lastActivityAt = Date.now();
		expect(object.isHealthy()).toBe(true);
		object.resetIdleTimer();
		await vi.advanceTimersByTimeAsync(5 * MINUTE);
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "expired", disconnectReason: "realtime_idle_timeout" });
		expect(ended(object)).toMatchObject({ reason: "idle_timeout", initiated_by: "gateway" });
	});

	it("reports a quiet playground call as unhealthy to reconciliation", () => {
		const { object } = relay("openai", { source: "chat" });
		object.lastActivityAt = Date.now() - 6 * MINUTE;
		expect(object.isHealthy()).toBe(false);
	});

	it("rechecks a quiet call's key and funds every minute", async () => {
		vi.useFakeTimers();
		const { object } = relay("spacex-ai", { source: "api" });
		object.schedulePolicyRecheck();
		await vi.advanceTimersByTimeAsync(MINUTE);
		expect(object.persistUsage).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(MINUTE);
		expect(object.persistUsage).toHaveBeenCalledTimes(2);
	});
});

describe("running out of funds on an API call", () => {
	it("keeps going after a failed extension, warns once per threshold, and ends only at the overdraft cap", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai", { source: "api" });
		mocks.extendRealtimeSessionHold.mockRejectedValue(new Error("insufficient_funds"));
		mocks.getRealtimeFundingPosition.mockResolvedValueOnce({ overdraftUsedNanos: 0, remainingNanos: 2_000_000_000, capReached: false });
		await object.enforceBudget(object.session);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		expect(object.acceptingAudio).toBe(true);
		expect(sentOfType(object, "session.warning")).toEqual([expect.objectContaining({ code: "funds_low", remaining_usd: 2 })]);

		// The hold retry is throttled; the wallet is checked again on its own interval.
		mocks.getRealtimeFundingPosition.mockResolvedValue({ overdraftUsedNanos: 400_000_000, remainingNanos: 600_000_000, capReached: false });
		await vi.advanceTimersByTimeAsync(11_000);
		await object.enforceBudget(object.session);
		expect(mocks.extendRealtimeSessionHold).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(11_000);
		await object.enforceBudget(object.session);
		expect(mocks.extendRealtimeSessionHold).toHaveBeenCalledTimes(2);
		expect(sentOfType(object, "session.warning").map((event: any) => event.code)).toEqual(["funds_low", "overdraft_in_use"]);
		expect(sentOfType(object, "session.warning")[1]).toMatchObject({ remaining_usd: 0.6, overdraft_used_usd: 0.4 });

		mocks.getRealtimeFundingPosition.mockResolvedValue({ overdraftUsedNanos: 800_000_000, remainingNanos: 200_000_000, capReached: false });
		await vi.advanceTimersByTimeAsync(16_000);
		await object.enforceBudget(object.session);
		await vi.advanceTimersByTimeAsync(16_000);
		await object.enforceBudget(object.session);
		expect(sentOfType(object, "session.warning").map((event: any) => event.code)).toEqual(["funds_low", "overdraft_in_use", "overdraft_in_use"]);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();

		mocks.getRealtimeFundingPosition.mockResolvedValue({ overdraftUsedNanos: REALTIME_MAX_OVERDRAFT_NANOS, remainingNanos: -1, capReached: true });
		await vi.advanceTimersByTimeAsync(16_000);
		await object.enforceBudget(object.session);
		expect(ended(object)).toMatchObject({ reason: "insufficient_funds" });
	});

	it("resumes normal holds when an extension succeeds again", async () => {
		const { object } = relay("openai", { source: "api" });
		mocks.extendRealtimeSessionHold.mockRejectedValueOnce(new Error("insufficient_funds"));
		mocks.getRealtimeFundingPosition.mockResolvedValue({ overdraftUsedNanos: 0, remainingNanos: 3_000_000_000, capReached: false });
		await object.enforceBudget(object.session);
		expect(object.holdShortfall).toBe(true);
		object.lastHoldAttemptAt = 0;
		mocks.extendRealtimeSessionHold.mockResolvedValueOnce({ ...object.session, reserved_nanos: 10_000_000_000 });
		await object.enforceBudget(object.session);
		expect(object.holdShortfall).toBe(false);
		expect(sentOfType(object, "relay.hold_extended")).toHaveLength(1);
	});

	it("does not hang up when the wallet cannot be read", async () => {
		const { object } = relay("openai", { source: "api" });
		mocks.extendRealtimeSessionHold.mockRejectedValue(new Error("insufficient_funds"));
		mocks.getRealtimeFundingPosition.mockRejectedValue(new Error("db down"));
		await object.enforceBudget(object.session);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
	});

	it("keeps the playground's close on a failed extension", async () => {
		const { object } = relay("openai", { source: "chat" });
		mocks.extendRealtimeSessionHold.mockRejectedValue(new Error("insufficient_funds"));
		await object.enforceBudget(object.session);
		expect(mocks.getRealtimeFundingPosition).not.toHaveBeenCalled();
		expect(mocks.settleRealtimeSession.mock.calls[0][0]).toMatchObject({ status: "expired", disconnectReason: "realtime_credit_hold_extension_failed" });
		expect(ended(object)).toMatchObject({ reason: "insufficient_funds" });
	});

	it("matches settlement's overdraft arithmetic", () => {
		// $5 held, $4.50 spent: within the hold.
		expect(computeRealtimeFundingPosition({ estimatedCostNanos: 4.5e9, sessionReservedNanos: 5e9, walletBalanceNanos: 5e9, walletReservedNanos: 5e9 }))
			.toEqual({ overdraftUsedNanos: 0, remainingNanos: 1.5e9, capReached: false });
		// $5 held + $2 free, $7.40 spent: $0.40 of overdraft used.
		expect(computeRealtimeFundingPosition({ estimatedCostNanos: 7.4e9, sessionReservedNanos: 5e9, walletBalanceNanos: 7e9, walletReservedNanos: 5e9 }))
			.toEqual({ overdraftUsedNanos: 0.4e9, remainingNanos: 0.6e9, capReached: false });
		// Spent beyond holds + free + $1.
		expect(computeRealtimeFundingPosition({ estimatedCostNanos: 8e9, sessionReservedNanos: 5e9, walletBalanceNanos: 7e9, walletReservedNanos: 5e9 }).capReached).toBe(true);
		// Existing debt shrinks the room.
		expect(computeRealtimeFundingPosition({ estimatedCostNanos: 5.6e9, sessionReservedNanos: 5e9, walletBalanceNanos: 4.5e9, walletReservedNanos: 5e9 }).capReached).toBe(true);
	});

	it("shares one overdraft across a workspace's concurrent calls", () => {
		// Two calls, each with a $5 hold, $2 free. The other call has spent $7, $2 beyond its hold.
		const other = realtimeUnheldCostNanos([{ estimated_cost_nanos: 7e9, captured_nanos: 0, reserved_nanos: 5e9 }]);
		expect(other).toBe(2e9);
		// Alone, $6 spent would leave $2 of room; with the other call's $2 the free balance is gone.
		expect(computeRealtimeFundingPosition({ estimatedCostNanos: 6e9, sessionReservedNanos: 5e9, walletBalanceNanos: 12e9, walletReservedNanos: 10e9, otherSessionsUnheldNanos: other }))
			.toEqual({ overdraftUsedNanos: 1e9, remainingNanos: 0, capReached: true });
		// Captured cost and a session within its hold add nothing.
		expect(realtimeUnheldCostNanos([
			{ estimated_cost_nanos: 3e9, captured_nanos: 1e9, reserved_nanos: 2e9 },
			{ estimated_cost_nanos: 1e9, captured_nanos: 0, reserved_nanos: 5e9 },
		])).toBe(0);
	});
});

describe("policy blocks and removed providers", () => {
	const blocked = (object: any, reason = "realtime_workspace_policy_blocked") =>
		({ ...object.session, status: "connected", policy_warnings: [reason] });

	it("warn, recheck after 30 seconds and end if the block still applies", async () => {
		vi.useFakeTimers();
		const { object } = relay("spacex-ai", { source: "api" });
		delete object.persistUsage;
		mocks.updateRealtimeSessionUsage.mockResolvedValue(blocked(object, "realtime_provider_not_available"));
		await object.persistUsage();
		await object.persistUsage();
		expect(sentOfType(object, "session.warning")).toEqual([
			expect.objectContaining({ code: "policy_blocked", status: "ending", seconds_remaining: 30 }),
		]);
		expect(object.acceptingAudio).toBe(true);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(mocks.updateRealtimeSessionUsage).toHaveBeenCalledTimes(3);
		expect(ended(object)).toMatchObject({ reason: "policy_blocked", initiated_by: "gateway" });
	});

	it("keep the call going when the change is undone during the grace period", async () => {
		vi.useFakeTimers();
		const { object } = relay("spacex-ai", { source: "api" });
		delete object.persistUsage;
		const cleared = { ...object.session, status: "connected" };
		mocks.updateRealtimeSessionUsage.mockResolvedValueOnce(blocked(object));
		await object.persistUsage();
		mocks.updateRealtimeSessionUsage.mockResolvedValue(cleared);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(sentOfType(object, "session.warning").map((event: any) => event.status)).toEqual(["ending", "cleared"]);
		expect(sentOfType(object, "session.ended")).toHaveLength(0);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
	});

	it("end the call if the recheck after the grace period fails", async () => {
		vi.useFakeTimers();
		const { object } = relay("spacex-ai", { source: "api" });
		delete object.persistUsage;
		mocks.updateRealtimeSessionUsage.mockResolvedValueOnce(blocked(object));
		await object.persistUsage();
		mocks.updateRealtimeSessionUsage.mockRejectedValue(new Error("supabase_down"));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(ended(object)).toMatchObject({ reason: "policy_blocked" });
	});

	it("give the same notice when the block surfaces as a failed hold extension", async () => {
		vi.useFakeTimers();
		const { object } = relay("openai", { source: "api" });
		mocks.extendRealtimeSessionHold.mockRejectedValue(new Error("realtime_workspace_policy_blocked"));
		await object.enforceBudget(object.session);
		expect(sentOfType(object, "session.warning")).toEqual([expect.objectContaining({ code: "policy_blocked" })]);
		expect(sentOfType(object, "session.ended")).toHaveLength(0);
	});
});

describe("spend limits on an API call", () => {
	it("warn once and never end the call", async () => {
		const { object } = relay("openai", { source: "api" });
		delete object.persistUsage;
		mocks.updateRealtimeSessionUsage.mockResolvedValue({ ...object.session, estimated_cost_nanos: 100, status: "connected", policy_warnings: ["realtime_key_cost_limit_reached"] });
		await object.persistUsage();
		await object.persistUsage();
		expect(sentOfType(object, "session.warning")).toEqual([
			expect.objectContaining({ code: "spend_limit_exceeded", limit: "key" }),
		]);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
		expect(object.acceptingAudio).toBe(true);
	});

	it("warn when a workspace budget blocks the hold, and the call continues", async () => {
		const { object } = relay("openai", { source: "api" });
		mocks.extendRealtimeSessionHold.mockRejectedValue(new Error("workspace_monthly_cost_budget_reached"));
		mocks.getRealtimeFundingPosition.mockResolvedValue({ overdraftUsedNanos: 0, remainingNanos: 40_000_000_000, capReached: false });
		await object.enforceBudget(object.session);
		expect(sentOfType(object, "session.warning").map((event: any) => [event.code, event.limit])).toEqual([
			["spend_limit_exceeded", "workspace_budget"],
			["funds_low", undefined],
		]);
		expect(mocks.settleRealtimeSession).not.toHaveBeenCalled();
	});

	it("still end a playground call", async () => {
		const { object } = relay("openai", { source: "chat" });
		delete object.persistUsage;
		mocks.updateRealtimeSessionUsage.mockResolvedValue({ ...object.session, status: "ending", disconnect_reason: "realtime_key_cost_limit_reached" });
		await object.persistUsage();
		expect(ended(object)).toMatchObject({ reason: "spend_limit_reached" });
	});
});

describe("provider duration caps", () => {
	it.each([
		["openai", "openai/gpt-realtime-2", 60],
		["spacex-ai", "spacex-ai/grok-voice", 120],
		["google-ai-studio", "google/gemini-3.1-flash-live-preview", 60],
		["openai", "openai/gpt-live-1", 25],
	])("%s %s ends at %i minutes from claim, with warnings 2 minutes and 30 seconds before", async (provider, model, minutes) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-10-22T10:00:00Z"));
		const { object, storage } = relay(provider as string, { model: model as string, live: String(model).includes("gpt-live") });
		// Created 90 s before the relay connected: the cap must not count that time.
		object.session.started_at = new Date(Date.now() - 90_000).toISOString();
		object.session.expires_at = new Date(Date.now() - 90_000 + (minutes as number) * MINUTE).toISOString();
		object.startClock();
		expect(object.deadlineMs).toBe(Date.now() + (minutes as number) * MINUTE);
		await object.scheduleExpiryAlarm();
		expect(storage.setAlarm).toHaveBeenLastCalledWith(Date.now() + (minutes as number) * MINUTE);
		object.scheduleDurationWarnings();

		await vi.advanceTimersByTimeAsync((minutes as number) * MINUTE - 120_000);
		expect(sentOfType(object, "session.warning")).toEqual([
			expect.objectContaining({ code: "max_duration_approaching", seconds_remaining: 120 }),
		]);
		await vi.advanceTimersByTimeAsync(90_000);
		expect(sentOfType(object, "session.warning").map((event: any) => event.seconds_remaining)).toEqual([120, 30]);
	});

	it("restores the claim-based deadline after an eviction", async () => {
		const { object, storage } = relay("openai");
		await storage.put({ session_id: "rt_test", claimed_at_ms: 1_000, deadline_ms: 3_601_000 });
		object.session = null;
		object.usage = {};
		object.upstream = null;
		object.client = null;
		mocks.getRealtimeSessionForInternal.mockResolvedValue({ session_id: "rt_test", provider: "openai", model_id: "openai/voice", usage: {} });
		await object.restoreStateIfEvicted("rt_test");
		expect(object.deadlineMs).toBe(3_601_000);
	});

	it("raises the relay-wide audio ingress cap to the longest provider limit", () => {
		const audio = Buffer.alloc((24_000 * 2) / 10).toString("base64");
		expect(validateRealtimeAudioIngress({ base64: audio, sampleRate: 24_000, currentInputMs: 90 * MINUTE, elapsedMs: 91 * MINUTE }))
			.toMatchObject({ ok: true });
		expect(validateRealtimeAudioIngress({ base64: audio, sampleRate: 24_000, currentInputMs: 120 * MINUTE, elapsedMs: 121 * MINUTE }))
			.toEqual({ ok: false, reason: "realtime_audio_duration_exceeded" });
	});
});

describe("Google goAway", () => {
	it("becomes a provider_closing warning when no resumption handle is available", async () => {
		const { object } = relay("google-ai-studio");
		await providerEvent(object, { goAway: { timeLeft: "50s" } });
		await providerEvent(object, { goAway: { timeLeft: "40s" } });
		expect(sentOfType(object, "session.warning")).toEqual([
			expect.objectContaining({ code: "provider_closing", seconds_remaining: 50 }),
		]);
	});
});

describe("end reasons", () => {
	it.each([
		["client_requested_end", "client_requested", "client"],
		["client_disconnected_authoritative_usage_timeout", "client_disconnected", "client"],
		["provider_socket_closed", "provider_closed", "provider"],
		["provider_socket_error", "provider_error", "provider"],
		["realtime_provider_connection_failed", "provider_error", "provider"],
		["realtime_max_duration", "max_duration_reached", "gateway"],
		["realtime_overdraft_cap_reached", "insufficient_funds", "gateway"],
		["realtime_credit_hold_extension_failed", "insufficient_funds", "gateway"],
		["realtime_key_revoked", "key_revoked", "gateway"],
		["realtime_workspace_disabled", "workspace_disabled", "gateway"],
		["realtime_workspace_policy_blocked", "policy_blocked", "gateway"],
		["realtime_key_cost_limit_reached", "spend_limit_reached", "gateway"],
		["realtime_idle_timeout", "idle_timeout", "gateway"],
		["realtime_audio_rate_exceeded", "input_rejected", "gateway"],
		["provider_event_processing_failed", "gateway_error", "gateway"],
		["realtime_session_reconciliation_expired", "session_reconciled", "gateway"],
		["something_new", "gateway_error", "gateway"],
	])("%s -> %s", (internal, reason, initiatedBy) => {
		expect(classifyRealtimeEnd(internal)).toEqual({ reason, initiatedBy });
		expect(REALTIME_END_REASONS).toContain(reason);
	});
});
