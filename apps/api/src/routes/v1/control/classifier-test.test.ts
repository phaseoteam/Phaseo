import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, type FakeDb } from "./__fixtures__/fake-supabase";

type GatewayCall = { path: string; authorization: string | null; metadata: any; body: any };

const state = vi.hoisted(() => ({
	db: null as unknown as FakeDb,
	authorized: null as null | Record<string, unknown>,
	denial: null as Response | null,
	capabilities: [] as string[],
	calls: [] as GatewayCall[],
	responses: [] as Array<{ status: number; body: unknown }>,
}));

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => state.db.client }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));
// Scope, role and feature-flag checks are the classifier routes' own (tested in classifiers.test.ts).
vi.mock("./classifiers", () => ({
	authorizeClassifiers: async (_req: Request, capability: string) => {
		state.capabilities.push(capability);
		if (state.denial) return { response: state.denial };
		return { auth: state.authorized };
	},
}));
vi.mock("@pipeline/index", () => ({
	getRequestClassifierHandler: (path: string) => async (request: Request) => {
		state.calls.push({
			path,
			authorization: request.headers.get("authorization"),
			metadata: JSON.parse(request.headers.get("x-phaseo-metadata") ?? "null"),
			body: await request.json(),
		});
		const next = state.responses.shift() ?? { status: 200, body: { id: "resp_1", model: "openai/gpt-5-mini", cost_nanos: 42_000, output_text: JSON.stringify({ d0: { value: "billing", confidence: 0.9 } }) } };
		return new Response(JSON.stringify(next.body), { status: next.status, headers: { "x-phaseo-request-id": "req_gateway_1" } });
	},
}));

import { classifierTestRoutes } from "./classifier-test";

const WS = "ws_1";
const SAVED_ID = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ID = "00000000-0000-4000-8000-0000000000bb";
const dimensions = [{ key: "topic", name: "Topic", values: [{ value: "billing" }, { value: "bugs" }] }];
const OAUTH = { workspaceId: WS, authMethod: "oauth", userId: "user_1", oauthScopes: ["classifiers:write", "gateway:access"] };

const post = (body: unknown, authorization = "Bearer phaseo_v1_sk_oauth_token") => classifierTestRoutes.request("https://api.phaseo.test/test", {
	method: "POST",
	headers: { "content-type": "application/json", authorization },
	body: JSON.stringify(body),
});

beforeEach(() => {
	state.db = createFakeDb({
		workspace_request_classifiers: [
			{ id: SAVED_ID, workspace_id: WS, name: "Topics", model: "openai/gpt-5-mini", instructions: "Pick the topic.", dimensions },
			{ id: OTHER_ID, workspace_id: "ws_other", name: "Theirs", model: "openai/gpt-5-mini", instructions: "", dimensions },
		],
	});
	state.authorized = { ...OAUTH };
	state.denial = null;
	state.capabilities.length = 0;
	state.calls.length = 0;
	state.responses.length = 0;
});

describe("POST /v1/classifiers/test", () => {
	it("runs a draft through the gateway with the caller's own credential and the test label", async () => {
		const response = await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "Why was I charged twice?" } });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data).toEqual({
			labels: [{ key: "topic", value: "billing", confidence: 0.9 }],
			answered: true,
			cost_usd: 0.000042,
			model: "openai/gpt-5-mini",
			format: "json_schema",
			request_id: "req_gateway_1",
		});
		expect(state.calls).toHaveLength(1);
		expect(state.calls[0]).toMatchObject({
			path: "responses",
			authorization: "Bearer phaseo_v1_sk_oauth_token",
			metadata: { labels: [{ key: "phaseo.classifier_test", value: "draft" }] },
		});
		expect(JSON.stringify(state.calls[0].body)).toContain("Why was I charged twice?");
	});

	it("needs classifiers:write, checked by the classifier routes' own authorization", async () => {
		await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "hi" } });
		expect(state.capabilities).toEqual(["classifiers:write"]);
		state.denial = new Response(JSON.stringify({ error: "insufficient_scope" }), { status: 403 });
		const response = await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "hi" } });
		expect(response.status).toBe(403);
		expect(state.calls).toHaveLength(1);
	});

	it("refuses management keys instead of creating a key for them", async () => {
		state.authorized = { workspaceId: WS, authMethod: "api_key", scopes: ["classifiers:write"] };
		const response = await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "hi" } }, "Bearer phaseo_v1_mk_kid_secret");
		expect(response.status).toBe(403);
		expect((await response.json() as any).error).toBe("gateway_access_required");
		expect(state.calls).toHaveLength(0);
	});

	it("refuses OAuth tokens without gateway:access", async () => {
		state.authorized = { ...OAUTH, oauthScopes: ["classifiers:write"] };
		const response = await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "hi" } });
		expect(response.status).toBe(403);
		expect((await response.json() as any).error).toBe("gateway_access_required");
		expect(state.calls).toHaveLength(0);
	});

	it("tests a saved classifier by id and labels the request with it", async () => {
		const response = await post({ classifier_id: SAVED_ID.toUpperCase(), sample: { prompt: "App crashes on start", response: "Sorry about that" } });
		expect(response.status).toBe(200);
		expect(state.calls[0].metadata).toEqual({ labels: [{ key: "phaseo.classifier_test", value: SAVED_ID }] });
		expect(JSON.stringify(state.calls[0].body)).toContain("Pick the topic.");
	});

	it("does not find another workspace's classifier", async () => {
		const response = await post({ classifier_id: OTHER_ID, sample: { prompt: "hi" } });
		expect(response.status).toBe(404);
		expect(state.calls).toHaveLength(0);
	});

	it("validates the draft and the sample before any model request", async () => {
		for (const body of [
			{ sample: { prompt: "hi" } },
			{ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: {} },
			{ classifier: { model: "openai/gpt-5-mini", dimensions: [{ key: "phaseo.topic", values: [{ value: "a" }, { value: "b" }] }] }, sample: { prompt: "hi" } },
			{ classifier_id: "not-a-uuid", sample: { prompt: "hi" } },
			{ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "x".repeat(8_001) } },
		]) {
			expect((await post(body)).status).toBe(400);
		}
		expect(state.calls).toHaveLength(0);
	});

	it("retries a refused schema request as prompted JSON, as the gateway does, and reports gateway failures", async () => {
		state.responses.push({ status: 400, body: { error: { message: "json_schema not supported" } } });
		let response = await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "hi" } });
		expect(response.status).toBe(200);
		expect((await response.json() as any).data.format).toBe("json");
		expect(state.calls).toHaveLength(2);

		state.responses.push({ status: 402, body: { error: { message: "Insufficient credits" } } });
		response = await post({ classifier: { model: "openai/gpt-5-mini", dimensions }, sample: { prompt: "hi" } });
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ error: "classifier_test_failed", status: 402, message: "Insufficient credits" });
	});
});
