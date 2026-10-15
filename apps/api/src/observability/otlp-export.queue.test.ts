import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueGatewayOtlpExport } from "./otlp-export";
import type { GatewayGenAiTelemetry } from "./otel-genai";

const state = vi.hoisted(() => ({
	bindings: {} as Record<string, any>,
	destinations: [] as Array<Record<string, unknown>>,
	upserts: [] as Array<Array<Record<string, unknown>>>,
}));

vi.mock("@core/tiered-cache", () => ({
	tieredRead: async ({ loader }: { loader: () => Promise<unknown> }) => loader(),
}));

vi.mock("@/runtime/env", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/runtime/env")>()),
	getBindings: () => state.bindings,
	getSupabaseAdmin: () => ({
		from: (table: string) => table === "workspace_broadcast_destinations"
			? { select: () => ({ eq: () => ({ in: () => ({ eq: async () => ({ data: state.destinations, error: null }) }) }) }) }
			: {
				upsert: async (rows: Array<Record<string, unknown>>) => {
					state.upserts.push(rows);
					return { error: null };
				},
			},
	}),
}));

const request: GatewayGenAiTelemetry = {
	requestId: "req_1",
	workspaceId: "workspace-1",
	endpoint: "chat.completions",
	requestedModel: "openai/gpt-5",
	requestPayload: { messages: [{ role: "user", content: "secret prompt" }], temperature: 0.2, response_format: { type: "json_object", schema: {} } },
	responsePayload: { choices: [{ message: { content: "secret answer" } }] },
	statusCode: 200,
	success: true,
	startedAtMs: 1_000,
	completedAtMs: 2_000,
};

const destination = (id: string, privacy = false) => ({
	id,
	destination_id: "otel_collector",
	destination_config: { endpoint: "https://collector.example.com" },
	privacy_exclude_prompts_and_outputs: privacy,
});

describe("enqueueGatewayOtlpExport", () => {
	let send: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		send = vi.fn(async () => undefined);
		state.bindings = { BROADCAST_QUEUE: { send }, BROADCAST_QUEUE_ENABLED: "true" };
		state.destinations = [destination("destination-1"), destination("destination-2", true)];
		state.upserts = [];
	});

	it("queues one event for every selected destination", async () => {
		expect(await enqueueGatewayOtlpExport(request)).toBe(2);
		expect(send).toHaveBeenCalledTimes(1);
		const [message] = send.mock.calls[0];
		expect(message).toMatchObject({
			eventId: "gateway:req_1",
			destinationIds: ["destination-1", "destination-2"],
			telemetry: { kind: "gateway", args: request },
		});
		expect(state.upserts).toEqual([]);
	});

	it("keeps prompts and outputs out of the queue when no destination receives them", async () => {
		state.destinations = [destination("destination-2", true)];
		await enqueueGatewayOtlpExport(request);
		const [message] = send.mock.calls[0];
		expect(message.telemetry.args.requestPayload).toEqual({ temperature: 0.2, response_format: { type: "json_object" } });
		expect(message.telemetry.args.responsePayload).toBeNull();
	});

	it("falls back to the outbox when the queue is not in use", async () => {
		state.bindings = {};
		expect(await enqueueGatewayOtlpExport(request)).toBe(2);
		expect(send).not.toHaveBeenCalled();
		expect(state.upserts).toHaveLength(1);
		expect(state.upserts[0].map((row) => row.destination_id)).toEqual(["destination-1", "destination-2"]);
		expect(JSON.stringify(state.upserts[0][0].payload)).toContain("secret prompt");
		expect(JSON.stringify(state.upserts[0][1].payload)).not.toContain("secret prompt");
	});
});
