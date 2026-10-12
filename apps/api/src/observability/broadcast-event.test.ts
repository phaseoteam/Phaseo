import { beforeEach, describe, expect, it, vi } from "vitest";
import { broadcastSpillKey, pruneBroadcastSpill, publishBroadcastEvent, type BroadcastTelemetry } from "./broadcast-event";

const bindings = vi.hoisted(() => ({ current: {} as Record<string, any> }));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => bindings.current,
}));

const telemetry = (prompt = "hello"): BroadcastTelemetry => ({
	kind: "gateway",
	args: {
		requestId: "req_1",
		workspaceId: "workspace-1",
		endpoint: "chat.completions",
		requestedModel: "openai/gpt-5",
		requestPayload: { messages: [{ role: "user", content: prompt }] },
		statusCode: 200,
		success: true,
		startedAtMs: 1,
		completedAtMs: 2,
	},
});

describe("publishBroadcastEvent", () => {
	let send: ReturnType<typeof vi.fn>;
	let put: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		send = vi.fn(async () => undefined);
		put = vi.fn(async () => null);
		bindings.current = {
			BROADCAST_QUEUE: { send },
			BROADCAST_QUEUE_ENABLED: "true",
			GATEWAY_IO_LOGS_BUCKET: { put },
		};
	});

	const publish = (event = telemetry()) => publishBroadcastEvent({
		eventId: "gateway:req_1",
		workspaceId: "workspace-1",
		destinationIds: ["destination-1", "destination-2"],
		telemetry: event,
	});

	it("leaves the event to the outbox unless the queue is bound and enabled", async () => {
		bindings.current.BROADCAST_QUEUE_ENABLED = "false";
		expect(await publish()).toBe(false);
		bindings.current = { BROADCAST_QUEUE_ENABLED: "true" };
		expect(await publish()).toBe(false);
		expect(send).not.toHaveBeenCalled();
	});

	it("sends one message for all the destinations", async () => {
		expect(await publish()).toBe(true);
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith({
			v: 1,
			eventId: "gateway:req_1",
			workspaceId: "workspace-1",
			destinationIds: ["destination-1", "destination-2"],
			attempt: 1,
			telemetry: telemetry(),
		}, { contentType: "json" });
		expect(put).not.toHaveBeenCalled();
	});

	it("stores events too large for a message in R2", async () => {
		const large = telemetry("x".repeat(130_000));
		expect(await publish(large)).toBe(true);
		const [key, body] = put.mock.calls[0];
		expect(key).toMatch(/^broadcast-spill\/\d{4}-\d{2}-\d{2}\/gateway%3Areq_1\.json$/);
		expect(JSON.parse(body)).toEqual(large);
		const [message] = send.mock.calls[0];
		expect(message).toMatchObject({ spillKey: key, attempt: 1 });
		expect(message).not.toHaveProperty("telemetry");
	});

	it("reports a failed send so the caller can use the outbox", async () => {
		send.mockRejectedValueOnce(new Error("queue unavailable"));
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(await publish()).toBe(false);
	});
});

describe("pruneBroadcastSpill", () => {
	it("deletes spilled events older than the queue keeps messages", async () => {
		const now = new Date("2026-10-12T09:00:00Z");
		const keys = [
			broadcastSpillKey("a", new Date("2026-10-06T23:00:00Z")),
			broadcastSpillKey("b", new Date("2026-10-07T01:00:00Z")),
			broadcastSpillKey("c", now),
		];
		const bucket = {
			list: vi.fn(async () => ({ objects: keys.map((key) => ({ key })) })),
			delete: vi.fn(async () => undefined),
		};
		expect(await pruneBroadcastSpill(bucket as unknown as R2Bucket, now)).toBe(1);
		expect(bucket.list).toHaveBeenCalledWith({ prefix: "broadcast-spill/", limit: 1000 });
		expect(bucket.delete).toHaveBeenCalledWith([keys[0]]);
	});
});
