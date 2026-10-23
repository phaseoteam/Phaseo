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
	receipts: new Set<string>(),
	health: [] as Array<Array<Record<string, unknown>>>,
}));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => ({
		rpc: async (name: string, args: { p_results: Array<Record<string, unknown>> }) => {
			if (name === "record_broadcast_destination_health") state.health.push(args.p_results);
			return { data: args.p_results.length, error: null };
		},
		from: (table: string) => table === "broadcast_event_receipts" ? {
			upsert: (rows: Array<{ event_id: string }>) => ({
				select: async () => {
					const inserted = rows.filter((row) => !state.receipts.has(row.event_id));
					for (const row of inserted) state.receipts.add(row.event_id);
					return { data: inserted, error: null };
				},
			}),
		} : ({
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

async function compressed(eventId: string, destinationIds: string[]) {
	const json = JSON.stringify(telemetry(eventId));
	const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
	const telemetryGzip = new Uint8Array(await new Response(stream).arrayBuffer());
	const queued = message({ eventId, destinationIds, telemetryGzip, telemetryBytes: json.length });
	delete queued.body.telemetry;
	return queued;
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
		state.receipts = new Set();
		state.health = [];
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

		expect(summary).toEqual({ messages: 2, duplicates: 0, requests: 1, delivered: 2, retried: 0, failed: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toBe("https://collector.example.com/v1/traces");
		const body = JSON.parse(String(init.body));
		expect(body.resourceSpans).toHaveLength(2);
		expect(first.ack).toHaveBeenCalled();
		expect(second.ack).toHaveBeenCalled();
	});

	it("splits OTLP requests by UTF-8 bytes, not characters", async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		// Span attributes are capped at 64,000 characters, about 192 KB of this
		// three-byte character. Thirty events fit in 3 MiB by length, not by bytes.
		const wide = (eventId: string) => {
			const queued = message({ eventId, destinationIds: ["collector"] });
			const base = telemetry(eventId);
			queued.body.telemetry = { ...base, args: { ...base.args, requestPayload: { messages: [{ role: "user", content: "漢".repeat(70_000) }] } } } as BroadcastTelemetry;
			return queued;
		};

		const events = Array.from({ length: 30 }, (_, index) => wide(`req_${index}`));
		const characters = events.reduce((sum, event) => sum + JSON.stringify(event.body.telemetry).length, 0);
		expect(characters).toBeLessThan(3 * 1024 * 1024);

		const summary = await processBroadcastQueueBatch(batch(...events));

		expect(summary.delivered).toBe(30);
		expect(summary.requests).toBeGreaterThan(1);
		for (const [, init] of fetchMock.mock.calls as Array<[URL, RequestInit]>) {
			expect(new TextEncoder().encode(String(init.body)).byteLength).toBeLessThan(3 * 1024 * 1024);
		}
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

	it("writes one object per row destination for the whole batch", async () => {
		state.destinations = [{
			id: "bucket", destination_id: "s3", enabled: true,
			destination_config: { bucket: "traces", region: "eu-west-2", access_key_id: "AKIA", secret_access_key: "secret" },
		}];
		const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);

		const summary = await processBroadcastQueueBatch(batch(
			message({ eventId: "req_1", destinationIds: ["bucket"] }),
			message({ eventId: "req_2", destinationIds: ["bucket"] }),
		));

		expect(summary).toMatchObject({ requests: 1, delivered: 2, failed: 0 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
		expect(url.toString()).toMatch(/^https:\/\/traces\.s3\.eu-west-2\.amazonaws\.com\/phaseo\/\d{4}\/\d{2}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.jsonl\.gz$/);
		expect(init.method).toBe("PUT");
		const text = await new Response(new Blob([init.body as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
		const rows = text.trim().split("\n").map((line) => JSON.parse(line));
		expect(new Set(rows.map((row) => row.event_id))).toEqual(new Set(["req_1", "req_2"]));
		expect(rows.every((row) => row.trace_id && row.span_id && row.attributes)).toBe(true);
	});

	it("retries a row destination's server errors and reports its error code", async () => {
		state.destinations = [
			{ id: "busy", destination_id: "r2", enabled: true, destination_config: { bucket: "busy", account_id: "0123456789abcdef0123456789abcdef", access_key_id: "a", secret_access_key: "s" } },
			{ id: "denied", destination_id: "gcs", enabled: true, destination_config: { bucket: "denied", access_key_id: "a", secret_access_key: "s" } },
		];
		vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.hostname === "storage.googleapis.com"
			? new Response("<?xml version='1.0'?><Error><Code>AccessDenied</Code><Message>Access denied.</Message></Error>", { status: 403 })
			: new Response(null, { status: 503 })));

		const summary = await processBroadcastQueueBatch(batch(message({ eventId: "req_1", destinationIds: ["busy", "denied"] })));

		expect(summary).toMatchObject({ requests: 2, delivered: 0, retried: 1, failed: 1 });
		expect(sendBatch).toHaveBeenCalledWith([expect.objectContaining({ body: expect.objectContaining({ destinationIds: ["busy"], attempt: 2 }) })]);
		expect(console.warn).toHaveBeenCalledWith("broadcast_delivery_failed", expect.objectContaining({ destinationId: "denied", status: 403, retryable: false, error: "Destination returned 403: AccessDenied" }));
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

	it("records each destination's health once per batch", async () => {
		vi.stubGlobal("fetch", vi.fn(async (url: URL) => url.hostname === "collector.example.com"
			? new Response(null, { status: 200 })
			: new Response(null, { status: 401 })));
		state.destinations = [otlp("collector"), webhook("hook"), { ...webhook("off"), enabled: false }];

		await processBroadcastQueueBatch(batch(
			message({ eventId: "req_1", destinationIds: ["collector", "hook", "off"] }),
			message({ eventId: "req_2", destinationIds: ["collector", "hook"] }),
		));

		expect(state.health).toHaveLength(1);
		const byId = Object.fromEntries(state.health[0].map((entry) => [entry.destination_id, entry]));
		expect(Object.keys(byId).sort()).toEqual(["collector", "hook"]);
		expect(byId.collector).toMatchObject({ delivered: 2, failed: 0, failures: 0, last_failure_at: null, last_error: null });
		expect(byId.collector.last_success_at).toEqual(expect.any(String));
		expect(byId.hook).toMatchObject({
			delivered: 0,
			failed: 2,
			failures: 2,
			last_success_at: null,
			last_http_status: 401,
			last_error: "Webhook endpoint returned 401",
		});
	});

	it("counts a failure that will be retried in the streak but not as a failed event", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));

		await processBroadcastQueueBatch(batch(message({ eventId: "req_1", destinationIds: ["collector"] })));

		expect(state.health[0]).toEqual([expect.objectContaining({
			destination_id: "collector", delivered: 0, failed: 0, failures: 1, last_http_status: 503,
		})]);
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
		expect(state.health).toEqual([]);
	});

	it("retries the batch when destinations cannot be loaded", async () => {
		state.loadError = { message: "timeout" };
		const event = message({ eventId: "req_1", destinationIds: ["collector"] });

		await processBroadcastQueueBatch(batch(event));

		expect(event.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
		expect(event.ack).not.toHaveBeenCalled();

		const later = { ...message({ eventId: "req_2", destinationIds: ["collector"] }), attempts: 40 };
		await processBroadcastQueueBatch(batch(later));
		expect(later.retry).toHaveBeenCalledWith({ delaySeconds: 900 });
	});

	it("delivers an event emitted twice only once", async () => {
		const fetchMock = vi.fn().mockImplementation(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		await processBroadcastQueueBatch(batch(message({ eventId: "req_1", destinationIds: ["collector"] })));
		const again = message({ eventId: "req_1", destinationIds: ["collector"] });
		const retried = message({ eventId: "req_1", destinationIds: ["collector"], attempt: 2 });

		const summary = await processBroadcastQueueBatch(batch(again, retried));

		expect(summary).toMatchObject({ duplicates: 1, delivered: 1 });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(again.ack).toHaveBeenCalled();
	});

	it("delivers spilled events one at a time", async () => {
		const order: string[] = [];
		vi.stubGlobal("fetch", vi.fn(async () => {
			order.push("send");
			return new Response(null, { status: 200 });
		}));
		bucket.get.mockImplementation(async (key: string) => {
			order.push(`load ${key}`);
			return { json: async () => telemetry(key) };
		});

		const summary = await processBroadcastQueueBatch(batch(
			message({ eventId: "req_1", destinationIds: ["collector"], telemetry: undefined, spillKey: "a" }),
			message({ eventId: "req_2", destinationIds: ["collector"], telemetry: undefined, spillKey: "b" }),
		));

		expect(order).toEqual(["load a", "send", "load b", "send"]);
		expect(summary).toMatchObject({ requests: 2, delivered: 2 });
		expect(bucket.delete).toHaveBeenCalledWith(["a", "b"]);
	});

	it("splits retries to stay under the queue's batch size limit", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
		const large = (eventId: string) => {
			const event = telemetry(eventId);
			event.args.requestPayload = { messages: [{ role: "user", content: "x".repeat(90_000) }] };
			return message({ eventId, destinationIds: ["collector"], telemetry: event });
		};

		await processBroadcastQueueBatch(batch(large("req_1"), large("req_2"), large("req_3")));

		expect(sendBatch.mock.calls.map(([messages]) => messages.length)).toEqual([2, 1]);
	});

	it("delivers compressed events and keeps them compressed on retry", async () => {
		const fetchMock = vi.fn(async (url: URL) => url.hostname === "collector.example.com"
			? new Response(null, { status: 200 })
			: new Response(null, { status: 503 }));
		vi.stubGlobal("fetch", fetchMock);
		const event = await compressed("req_1", ["collector", "hook"]);

		const summary = await processBroadcastQueueBatch(batch(event));

		expect(summary).toMatchObject({ delivered: 1, retried: 1 });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
		expect(url.hostname).toBe("collector.example.com");
		expect(String(init.body)).toContain("hello");
		const [[retry]] = sendBatch.mock.calls[0];
		expect(retry.contentType).toBe("v8");
		expect(retry.body).toMatchObject({ destinationIds: ["hook"], telemetryGzip: event.body.telemetryGzip });
	});

	it("drops compressed events that cannot be decompressed", async () => {
		const event = await compressed("req_1", ["collector"]);
		event.body.telemetryGzip = new Uint8Array([1, 2, 3]);

		await processBroadcastQueueBatch(batch(event));

		expect(event.ack).toHaveBeenCalled();
		expect(event.retry).not.toHaveBeenCalled();
	});

	it("delivers large compressed events in several rounds", async () => {
		const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
		vi.stubGlobal("fetch", fetchMock);
		const events = await Promise.all(["req_1", "req_2", "req_3"].map(async (id) => {
			const event = await compressed(id, ["collector"]);
			event.body.telemetryBytes = 7_000_000;
			return event;
		}));

		const summary = await processBroadcastQueueBatch(batch(...events));

		expect(summary).toMatchObject({ requests: 2, delivered: 3 });
	});

	it("acknowledges messages it cannot read", async () => {
		const invalid = { ...message({ eventId: "req_1", destinationIds: [] }), body: { v: 2 } };
		await processBroadcastQueueBatch(batch(invalid as ReturnType<typeof message>));
		expect(invalid.ack).toHaveBeenCalled();
	});
});
