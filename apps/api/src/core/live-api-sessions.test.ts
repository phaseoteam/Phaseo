import { afterEach, describe, expect, it, vi } from "vitest";
import recording from "./__fixtures__/realtime/gpt-live-function-call.json";
import { LIVE_PRICE_CARD, liveStartEvent, priceLiveUsage, type LiveConfig } from "./live-sessions";
import { liveBackendSettingsSchema } from "./live-settings";
import { RealtimeRelayDurableObject } from "./realtime-relay-durable-object";
import { classifyRealtimeEnd } from "./realtime-session-events";
import { createLiveSessionSchema } from "@/routes/v1/data/realtime-sessions";

const mocks = vi.hoisted(() => ({
	settleRealtimeSession: vi.fn(async () => ({
		session: { final_cost_nanos: 1_812_000 },
		settlement: { final_cost_nanos: 1_812_000, debt_nanos: 0, uncollected_nanos: 0 },
	})),
	markRealtimeSessionConnected: vi.fn(async () => ({})),
}));

vi.mock("@/runtime/env", () => ({ configureRuntime: vi.fn() }));
vi.mock("@observability/otlp-export", () => ({ enqueueAsyncGenAiOtlpExport: vi.fn(async () => undefined) }));
vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: vi.fn(async () => null) }));
vi.mock("@core/realtime-sessions", async (importOriginal) => ({
	...(await importOriginal<typeof import("./realtime-sessions")>()),
	settleRealtimeSession: mocks.settleRealtimeSession,
	markRealtimeSessionConnected: mocks.markRealtimeSessionConnected,
}));

const getTime = { type: "function" as const, name: "get_time", description: "Returns the current UTC time.",
	parameters: { type: "object", properties: {}, additionalProperties: false } };
const config: LiveConfig = {
	backendModel: "openai/gpt-5.6-luna",
	voiceCard: LIVE_PRICE_CARD,
	settings: liveBackendSettingsSchema.parse({ tools: [getTime], parallel_tool_calls: false }),
	backendCard: { ...LIVE_PRICE_CARD, model: "openai/gpt-5.6-luna", endpoint: "text.generate", rules: [
		["input_text_tokens", "1"], ["cached_read_text_tokens", "0.1"], ["cached_write_text_tokens", "1.25"], ["output_text_tokens", "10"],
	].map(([meter, price]) => ({ ...LIVE_PRICE_CARD.rules[0], meter: meter as any, unit: "token", unit_size: 1_000_000, price_per_unit: price })) },
};

function relay() {
	const data = new Map<string, unknown>();
	const storage = {
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
	object.session = { session_id: "rt_test", workspace_id: "workspace", key_id: "key", source: "api", provider: "openai",
		model_id: "openai/gpt-live-1", metadata: { live: config }, reserved_nanos: 5_000_000_000, estimated_cost_nanos: 0 };
	object.upstream = { readyState: 1, bufferedAmount: 0, close: vi.fn() };
	object.client = { readyState: 1, bufferedAmount: 0, close: vi.fn() };
	object.claimedAtMs = Date.now() - 30_000;
	object.usage = { live_started: true };
	object.sendClientRaw = vi.fn();
	object.sendUpstream = vi.fn();
	object.persistUsage = vi.fn(async () => undefined);
	mocks.markRealtimeSessionConnected.mockImplementation(async () => object.session);
	return object;
}

const sent = (object: any) => object.sendClientRaw.mock.calls.map(([text]: [string]) => JSON.parse(text));
const sentOfType = (object: any, type: string) => sent(object).filter((event: any) => event.type === type);
const play = async (object: any, events: Array<{ event: unknown }>) => {
	for (const { event } of events) await object.handleUpstreamMessage(JSON.stringify(event));
};
const client = (object: any, event: unknown) => object.handleClientMessage(JSON.stringify(event));

afterEach(() => {
	vi.clearAllMocks();
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("GPT Live API sessions", () => {
	it("accept API source and client-executed function tools in the create request", () => {
		const request = { model: "openai/gpt-live-1", provider: "openai" };
		expect(createLiveSessionSchema.safeParse(request).success).toBe(true);
		expect(createLiveSessionSchema.safeParse({ ...request, source: "api", voice: "cedar",
			backend_settings: { tools: [getTime], tool_choice: "required" } }).success).toBe(true);
		for (const settings of [
			{ tools: [{ type: "function" }] },
			{ tools: [{ ...getTime, type: "web_search" }] },
			{ tools: [{ ...getTime, name: "bad name" }] },
			{ tools: [getTime, getTime] },
			{ tools: [{ ...getTime, server_url: "https://example.com" }] },
			{ tool_choice: "required" },
		]) {
			expect(createLiveSessionSchema.safeParse({ ...request, backend_settings: settings }).success).toBe(false);
		}
	});

	it("pass function tools to the delegated backend next to web search", () => {
		const settings = liveBackendSettingsSchema.parse({ tools: [getTime], web_search: true });
		expect(liveStartEvent({ ...config, settings }, "marin").session.delegation.responses.tools)
			.toEqual([{ type: "web_search" }, getTime]);
	});

	it("relay a recorded tool call both ways and bill both backend responses", async () => {
		const object = relay();
		await play(object, recording.events);
		// The function call reaches the client unchanged and does not fail billing.
		expect(sent(object).filter((event: any) => event.event?.item?.type === "function_call")).toHaveLength(2);
		expect(object.usage.live_billing_error).toBeUndefined();
		expect(object.usage.live_function_call_ids).toEqual(["call_63hZ5USZAvkMvXYxqNFqbqsM"]);

		// Only continuations of a real tool call are accepted.
		await client(object, { type: "response.create" });
		await client(object, { type: "response.item.create", item: { type: "function_call_output", call_id: "call_unknown", output: "{}" } });
		await client(object, { type: "response.item.create", item: { type: "message", role: "user", content: [] } });
		expect(sentOfType(object, "relay.client_event_rejected").map((event: any) => event.reason)).toEqual([
			"live_response_create_requires_tool_output", "live_function_call_unknown", "live_function_call_unknown",
		]);
		expect(object.sendUpstream).not.toHaveBeenCalled();

		for (const { event } of recording.client_tool_result) await client(object, event);
		expect(object.sendUpstream.mock.calls.map(([payload]: [unknown]) => payload)).toEqual(recording.client_tool_result.map(({ event }) => event));
		await client(object, recording.client_tool_result[0].event);
		expect(sentOfType(object, "relay.client_event_rejected").at(-1).reason).toBe("live_function_call_already_answered");

		await play(object, recording.after_tool_result);
		expect(mocks.settleRealtimeSession).toHaveBeenCalledOnce();
		const settled = mocks.settleRealtimeSession.mock.calls[0][0] as any;
		expect(settled).toMatchObject({ status: "completed", disconnectReason: "live_session_expired" });
		expect(settled.usage.live_responses.map((response: any) => [response.usage.input_text_tokens, response.usage.output_text_tokens]))
			.toEqual([[749, 14], [793, 13]]);
		// $1/M in and $10/M out on the test card; 0 voice seconds because no audio was sent.
		expect((priceLiveUsage(settled.usage, config).pricing as any).total_nanos).toBe(1_812_000);
	});

	it("measure the 64 KB tool output limit in bytes", async () => {
		const object = relay();
		await play(object, recording.events);
		const callId = "call_63hZ5USZAvkMvXYxqNFqbqsM";
		// 30,000 CJK characters are about 90 KB of UTF-8.
		await client(object, { type: "response.item.create", item: { type: "function_call_output", call_id: callId, output: "界".repeat(30_000) } });
		expect(sentOfType(object, "relay.client_event_rejected").at(-1).reason).toBe("live_function_output_invalid");
		expect(object.sendUpstream).not.toHaveBeenCalled();
		await client(object, { type: "response.item.create", item: { type: "function_call_output", call_id: callId, output: "界".repeat(20_000) } });
		expect(object.sendUpstream).toHaveBeenCalledOnce();
	});

	it("end a session GPT Live expired for lack of audio with a clear reason", async () => {
		const object = relay();
		await play(object, recording.events.slice(0, 1));
		await play(object, recording.after_tool_result.slice(-1));
		expect(sentOfType(object, "session.ended")).toEqual([expect.objectContaining({
			reason: "provider_idle_timeout", initiated_by: "provider", billing_status: "settled",
		})]);
		expect(classifyRealtimeEnd("live_session_closed")).toEqual({ reason: "provider_closed", initiatedBy: "provider" });
	});

	it("reject tool results once the session is ending", async () => {
		vi.useFakeTimers();
		const object = relay();
		await play(object, recording.events);
		await client(object, { type: "session.end" });
		await client(object, recording.client_tool_result[0].event);
		expect(sentOfType(object, "relay.client_event_rejected").at(-1).reason).toBe("realtime_session_not_accepting_input");
		expect(object.sendUpstream).toHaveBeenCalledExactlyOnceWith({ type: "session.close" });
	});
});
