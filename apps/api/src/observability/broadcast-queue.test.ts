import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BroadcastQueueMessage, BroadcastTelemetry } from "./broadcast-event";
import { processBroadcastQueueBatch } from "./broadcast-queue";

vi.mock("@core/webhook-endpoints", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@core/webhook-endpoints")>();
	return { ...actual, validateWebhookEndpointUrlForDelivery: vi.fn(async (value: unknown) => actual.validateWebhookEndpointUrl(value)) };
});

const state = vi.hoisted(() => ({
	bindings: {} as Record<string, any>,
	destinations: [] as Array<Record<string, unknown>>,
	loadError: null as { message: string } | null,
}));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => ({
		from: () => ({
			select: () => ({
				in: async (_column: string, ids: string[]) => ({
					data: state.loadError ? null : state.destinations.filter((row) => ids.includes(String(row.id))),
					error: state.loadError,
				}),
			}),
		}),
	}),
}));

const otlp = (id: string, config: Record<string, unknown> = { endpoint: "https://collector.example.com" }) => ({
	id, destination_id: "otel_collector", destination_config: config, enabled: true,
});
const webhook = (id: string) => ({
	id, destination_id: "webhook", destination_config: { url: "https://hooks.example.com/traces" }, enabled: true,
});

const telemetry = (requestId: string): BroadcastTelemetry => ({
	kind: "gateway",
	args: {
		requestId,
		workspaceId: "workspace-1",
		endpoint: "chat.completions",
		requestedModel: "openai/gpt-5",
		requestPayload: { messages: [{ role: "user", content: "hello" }] },
		statusCode: 200,
		success: true,
		startedAtMs: 1_000,
		completedAtMs: 2_000,
	},
});

function message(body: Partial<BroadcastQueueMessage> & { eventId: string; destinationIds: string[] }) {
	return {
		id: body.eventId,
		timestamp: new Date(),
		attempts: 1,
		body: { v: 1, workspaceId: "workspace-1", attempt: 1, telemetry: telemetry(body.eventId), ...body },
		ack: vi.fn(),
		retry: vi.fn(),
	};
}

const batch = (...messages: Array<ReturnType<typeof message>>) =>
	({ queue: "phaseo-broadcast", messages }) as unknown as MessageBatch<unknown>;

describe("processBroadcastQueueBatch", () => {
	let sendBatch: ReturnType<typeof vi.fn>;
	let bucket: { get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

	beforeEach(() => {
		sendBatch = vi.fn(async () => undefined);
		bucket = { get: vi.fn(), delete: vi.fn(async () => undefined) };
		state.bindings = { BROADCAST_QUEUE: { sendBatch }, GATEWAY_IO_LOGS_BUCKET: bucket };
		state.destinations = [otlp("collector"), webhook("hook")];
		state.loadError = null;
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("sends one OTLP request per destination for the whole batch", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const first = message({ eventId: "req_1", destinationIds: ["collector"] });
		const second = message({ eventId: "req_2", destinationIds: ["collector"] });

		const summary = await processBroadcastQueueBatch(batch(first, second));

		expect(summary).toEqual({ messages: 2, requests: 1, delivered: 2, retried: 0, failed: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toBe("https://collector.example.com/v1/traces");
		const body = JSON.parse(String(init.body));
		expect(body.resourceSpans).toHaveLength(2);
		expect(first.ack).toHaveBeenCalled();
		expect(second.ack).toHaveBeenCalled();
	});

	it("sends webhooks one event per request", async () => {
		const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);

		const summary = await processBroadcastQueueBatch(batch(
			message({ eventId: "req_1", destinationIds: ["hook"] }),
			message({ eventId: "req_2", destinationIds: ["hook"] }),
		));

		expect(summary).toMatchObject({ requests: 2, delivered: 2 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		for (const [url, init] of fetchMock.mock.calls as Array<[URL, RequestInit]>) {
			expect(url.toString()).toBe("https://hooks.example.com/traces");
			expect(JSON.parse(String(init.body)).resourceSpans).toHaveLength(1);
		}
	});

	it("requeues an event for only the destinations that failed", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.hostname === "collector.example.com"
			? new Response(null, { status: 503, headers: { "retry-after": "7" } })
			: new Response(null, { status: 204 })));
		const event = message({ eventId: "req_1", destinationIds: ["collector", "hook"] });

		const summary = await processBroadcastQueueBatch(batch(event));

		expect(summary).toMatchObject({ delivered: 1, retried: 1, failed: 0 });
		expect(sendBatch).toHaveBeenCalledWith([{
			body: expect.objectContaining({ eventId: "req_1", destinationIds: ["collector"], attempt: 2 }),
			contentType: "json",
			delaySeconds: 7,
		}]);
		expect(event.ack).toHaveBeenCalled();
		expect(event.retry).not.toHaveBeenCalled();
	});

	it("retries the original message when the requeue fails", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503, headers: { "retry-after": "5" } })));
		sendBatch.mockRejectedValueOnce(new Error("queue unavailable"));
		const event = message({ eventId: "req_1", destinationIds: ["collector"] });

		await processBroadcastQueueBatch(batch(event));

		expect(event.retry).toHaveBeenCalledWith({ delaySeconds: 5 });
		expect(event.ack).not.toHaveBeenCalled();
	});

	it("gives up after the last attempt and deletes the spilled event", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
		bucket.get.mockResolvedValue({ json: async () => telemetry("req_1") });
		const event = message({ eventId: "req_1", destinationIds: ["collector"], attempt: 8, telemetry: undefined, spillKey: "broadcast-spill/2026-10-12/req_1.json" });

		const summary = await processBroadcastQueueBatch(batch(event));

		expect(summary).toMatchObject({ retried: 0, failed: 1 });
		expect(bucket.get).toHaveBeenCalledWith("broadcast-spill/2026-10-12/req_1.json");
		expect(sendBatch).not.toHaveBeenCalled();
		expect(bucket.delete).toHaveBeenCalledWith(["broadcast-spill/2026-10-12/req_1.json"]);
		expect(event.ack).toHaveBeenCalled();
	});

	it("drops events for destinations that were disabled or deleted", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		state.destinations = [{ ...otlp("collector"), enabled: false }];
		const event = message({ eventId: "req_1", destinationIds: ["collector", "deleted"] });

		const summary = await processBroadcastQueueBatch(batch(event));

		expect(summary).toMatchObject({ requests: 0, failed: 2 });
		expect(fetchMock).not.toHaveBeenCalled();
		expect(event.ack).toHaveBeenCalled();
	});

	it("retries the batch when destinations cannot be loaded", async () => {
		state.loadError = { message: "timeout" };
		const event = message({ eventId: "req_1", destinationIds: ["collector"] });

		await processBroadcastQueueBatch(batch(event));

		expect(event.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
		expect(event.ack).not.toHaveBeenCalled();
	});

	it("acknowledges messages it cannot read", async () => {
		const invalid = { ...message({ eventId: "req_1", destinationIds: [] }), body: { v: 2 } };
		await processBroadcastQueueBatch(batch(invalid as ReturnType<typeof message>));
		expect(invalid.ack).toHaveBeenCalled();
	});
});
