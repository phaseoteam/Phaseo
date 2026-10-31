import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./__fixtures__/fake-supabase";

const state = vi.hoisted(() => ({
	db: null as unknown as FakeDb,
	authorized: true,
	sent: [] as Array<{ kind: string; payload: any; config: Record<string, unknown>; type?: string }>,
	delivered: true,
}));

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => state.db.client, getBindings: () => ({}) }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));
vi.mock("./observability", async (importOriginal) => ({
	...(await importOriginal<typeof import("./observability")>()),
	authorizeObservability: async () => state.authorized
		? { auth: { workspaceId: "ws_1", userId: "user_1", requestId: "req_1" } }
		: { response: new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }) },
}));
vi.mock("@/observability/otlp-export", () => {
	const result = (kind: string) => async (payload: any, config: Record<string, unknown>, _attempts?: number, type?: string) => {
		state.sent.push({ kind, payload, config, type });
		return state.delivered
			? { delivered: true, retryable: false, status: 200, delayMs: 0, error: null }
			: { delivered: false, retryable: false, status: 401, delayMs: 0, error: "OTLP endpoint returned 401" };
	};
	return {
		deliverGatewayOtlpPayload: result("otlp"),
		deliverGatewayRowsPayload: result("rows"),
		deliverGatewayWebhookPayload: result("webhook"),
		destinationConfig: async (row: { destination_config: Record<string, unknown> }) => row.destination_config,
	};
});

import { observabilityTestRoutes } from "./observability-tests";

const post = (path: string, body?: unknown) => observabilityTestRoutes.request(`https://api.phaseo.test${path}`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: body === undefined ? undefined : JSON.stringify(body),
});
const messages = (payload: any) => payload.resourceSpans[0].scopeSpans[0].spans[0].attributes
	.filter((attribute: any) => attribute.key.startsWith("gen_ai.input") || attribute.key.startsWith("gen_ai.output"));

beforeEach(() => {
	state.db = createFakeDb({
		workspace_broadcast_destinations: [
			{ id: "dest_1", workspace_id: "ws_1", destination_id: "webhook", name: "Hook", privacy_exclude_prompts_and_outputs: false, destination_config: { url: "https://hooks.example.com/phaseo" } },
			{ id: "dest_private", workspace_id: "ws_1", destination_id: "webhook", name: "Private", privacy_exclude_prompts_and_outputs: true, destination_config: { url: "https://hooks.example.com/private" } },
			{ id: "dest_other", workspace_id: "ws_2", destination_id: "webhook", name: "Theirs", privacy_exclude_prompts_and_outputs: false, destination_config: { url: "https://hooks.example.com/theirs" } },
		],
	});
	state.authorized = true;
	state.delivered = true;
	state.sent.length = 0;
});

describe("observability destination tests", () => {
	it("checks a saved destination without messages, and sends a sample with them", async () => {
		let response = await post("/destinations/dest_1/test");
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toEqual({ ok: true, status: "Connected", http_status: 200, error: null });
		expect(messages(state.sent[0].payload)).toEqual([]);

		response = await post("/destinations/dest_1/sample");
		expect((await response.json() as any).data).toMatchObject({ ok: true, status: "Sample trace sent" });
		expect(messages(state.sent[1].payload)).toHaveLength(2);
		expect(state.sent[1]).toMatchObject({ kind: "webhook", config: { url: "https://hooks.example.com/phaseo" } });
	});

	it("leaves messages out of samples for destinations that exclude prompts and outputs", async () => {
		await post("/destinations/dest_private/sample");
		expect(messages(state.sent[0].payload)).toEqual([]);
	});

	it("reports a refused delivery as ok: false", async () => {
		state.delivered = false;
		const body = await (await post("/destinations/dest_1/test")).json() as any;
		expect(body.data).toEqual({ ok: false, status: "Failed", http_status: 401, error: "OTLP endpoint returned 401" });
	});

	it("finds only this workspace's destinations", async () => {
		expect((await post("/destinations/dest_other/test")).status).toBe(404);
		expect(state.sent).toHaveLength(0);
	});

	it("tests unsaved settings after the same validation as saving them", async () => {
		let response = await post("/destinations/test", { type: "webhook", config: { url: "https://hooks.example.com/new" } });
		expect((await response.json() as any).data).toMatchObject({ ok: true, status: "Connection verified" });
		expect(state.sent[0]).toMatchObject({ kind: "webhook", config: { url: "https://hooks.example.com/new" } });

		response = await post("/destinations/test", { type: "webhook", config: { url: "http://127.0.0.1/hook" } });
		expect(response.status).toBe(400);
		expect((await post("/destinations/test", { type: "carrier_pigeon", config: { url: "https://x.example.com" } })).status).toBe(400);
		expect(state.sent).toHaveLength(1);
	});

	it("needs an owner or admin with settings:write", async () => {
		state.authorized = false;
		expect((await post("/destinations/dest_1/sample")).status).toBe(403);
		expect(state.sent).toHaveLength(0);
	});
});
