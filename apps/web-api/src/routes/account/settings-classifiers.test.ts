import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { CHAT_PRIVACY_REVIEW_VERSION } from "@/chat/privacyReview";
import { currentSpendMonth } from "./settings-classifiers";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const CLASSIFIER_ID = "00000000-0000-4000-8000-0000000000c1";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "pepper",
	PHASEO_GATEWAY_URL: "https://gateway.test",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

const DEPARTMENT = {
	key: "department", name: "Department", description: null, multiple: false, allow_other: true,
	values: [{ value: "engineering", description: null }, { value: "legal", description: null }],
};

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: CLASSIFIER_ID, workspace_id: WORKSPACE, name: "Department", description: null, enabled: true,
		model: "google/gemini-2.5-flash-lite", instructions: "", dimensions: [DEPARTMENT], sample_rate_bps: 2_500,
		sample_by: "request", input_scope: "prompt", scope: {}, monthly_budget_nanos: 5_000_000_000, created_by: "user-a",
		created_at: "2026-10-19T12:00:00Z", updated_at: "2026-10-19T12:00:00Z", ...overrides,
	};
}

type Fixture = {
	role?: string | null;
	reviewed?: boolean;
	insertError?: { code: string; message: string } | null;
	gateway?: (request: Request) => Response;
};

function database(fixture: Fixture = {}) {
	const requests: Array<{ url: URL; method: string; body: any; headers: Headers }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers });
		if (url.hostname === "gateway.test") return fixture.gateway ? fixture.gateway(request) : new Response("{}", { status: 500 });
		if (url.pathname.endsWith("/auth/v1/user")) {
			return Response.json({
				id: "user-a", email: "fixture@example.com",
				app_metadata: fixture.reviewed ? { chat_privacy_reviews: { [WORKSPACE]: CHAT_PRIVACY_REVIEW_VERSION } } : {},
			});
		}
		if (url.pathname.endsWith("/workspace_members")) return Response.json(fixture.role ? [{ role: fixture.role }] : []);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
		if (url.pathname.endsWith("/workspace_request_classifiers")) {
			if (request.method === "POST" && fixture.insertError) return Response.json(fixture.insertError, { status: 400 });
			return Response.json([row(request.method === "PATCH" ? { enabled: false } : {})]);
		}
		if (url.pathname.endsWith("/workspace_request_classifier_spend_monthly")) {
			return Response.json([{ classifier_id: CLASSIFIER_ID, classifications: 1234, cost_nanos: 1_250_000_000 }]);
		}
		if (url.pathname.endsWith("/keys")) {
			if (request.method === "GET" && url.searchParams.get("kid")) return Response.json([{ id: "chat-key", workspace_id: WORKSPACE, status: "active", hash: "x" }]);
			return Response.json([{ id: "00000000-0000-4000-8000-0000000000a1", name: "Production", prefix: "abc123", status: "active" }]);
		}
		if (url.pathname.endsWith("/api_apps")) return Response.json([{ id: "00000000-0000-4000-8000-0000000000b1", title: "Support bot" }]);
		if (url.pathname.endsWith("/workspace_audit_events")) return new Response(null, { status: 201 });
		throw new Error(`Unexpected fixture request: ${request.method} ${url.pathname}`);
	}));
	return requests;
}

function call(path: string, init: RequestInit = {}) {
	return app.request(`https://phaseo.app/api/account/settings${path}`, {
		...init,
		headers: { authorization: "Bearer fixture-token", "content-type": "application/json", ...(init.headers ?? {}) },
	}, env, executionCtx);
}

afterEach(() => vi.unstubAllGlobals());

describe("classifier settings reads", () => {
	it("rejects a workspace the user does not belong to without reading classifiers", async () => {
		const requests = database({ role: null });
		const response = await call(`/classifiers?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(403);
		expect(requests.some((entry) => entry.url.pathname.endsWith("/workspace_request_classifiers"))).toBe(false);
	});

	it("tells members the page is for admins without exposing any classifier", async () => {
		const requests = database({ role: "member" });
		const response = await call(`/classifiers?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		const body = await response.json() as any;
		expect(body).toMatchObject({ canManageClassifiers: false, classifiers: [], workspaceId: WORKSPACE });
		expect(requests.some((entry) => entry.url.pathname.endsWith("/workspace_request_classifiers"))).toBe(false);
	});

	it("lists classifiers in API units with this month's pre-aggregated spend", async () => {
		const requests = database({ role: "admin" });
		const response = await call(`/classifiers?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		const body = await response.json() as any;
		expect(body.canManageClassifiers).toBe(true);
		expect(body.classifiers[0]).toMatchObject({
			id: CLASSIFIER_ID, sample_rate: 0.25, monthly_budget_usd: 5,
			usage: { classifications: 1234, costUsd: 1.25 },
		});
		expect(body.keys).toEqual([{ id: "00000000-0000-4000-8000-0000000000a1", name: "Production", prefix: "abc123", status: "active" }]);
		expect(body.apps).toEqual([{ id: "00000000-0000-4000-8000-0000000000b1", title: "Support bot" }]);
		const spend = requests.find((entry) => entry.url.pathname.endsWith("/workspace_request_classifier_spend_monthly"))!;
		expect(spend.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
		expect(spend.url.searchParams.get("month")).toBe(`eq.${currentSpendMonth()}`);
		const list = requests.find((entry) => entry.url.pathname.endsWith("/workspace_request_classifiers"))!;
		expect(list.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
	});
});

describe("classifier settings writes", () => {
	const valid = { workspaceId: WORKSPACE, name: "Department", model: "google/gemini-2.5-flash-lite", dimensions: [DEPARTMENT], sample_rate: 0.25, monthly_budget_usd: 5 };

	it("rejects members", async () => {
		const requests = database({ role: "member" });
		const response = await call("/classifiers", { method: "POST", body: JSON.stringify(valid) });
		expect(response.status).toBe(403);
		expect(requests.some((entry) => entry.url.pathname.endsWith("/workspace_request_classifiers"))).toBe(false);
	});

	it("validates with the shared rules before writing", async () => {
		const requests = database({ role: "admin" });
		const response = await call("/classifiers", {
			method: "POST",
			body: JSON.stringify({ ...valid, dimensions: [{ ...DEPARTMENT, values: [{ value: "other" }] }] }),
		});
		expect(response.status).toBe(400);
		expect(((await response.json()) as any).message).toContain("cannot list \"other\"");
		expect(requests.some((entry) => entry.url.pathname.endsWith("/workspace_request_classifiers"))).toBe(false);
	});

	it("stores storage units in the caller's workspace and records an audit event", async () => {
		const requests = database({ role: "admin" });
		const response = await call("/classifiers", { method: "POST", body: JSON.stringify({ ...valid, workspace_id: "victim" }) });
		expect(response.status).toBe(201);
		const insert = requests.find((entry) => entry.method === "POST" && entry.url.pathname.endsWith("/workspace_request_classifiers"))!;
		expect(insert.body).toMatchObject({ workspace_id: WORKSPACE, created_by: "user-a", sample_rate_bps: 2_500, monthly_budget_nanos: 5_000_000_000 });
		expect(insert.body).not.toHaveProperty("sample_rate");
		const auditEvent = requests.find((entry) => entry.url.pathname.endsWith("/workspace_audit_events"))!;
		expect(auditEvent.body).toMatchObject({ action: "request_classifier.created", target_id: CLASSIFIER_ID, workspace_id: WORKSPACE });
	});

	it("explains the workspace limit", async () => {
		database({ role: "admin", insertError: { code: "23514", message: "request_classifier_limit_reached" } });
		const response = await call("/classifiers", { method: "POST", body: JSON.stringify(valid) });
		expect(response.status).toBe(400);
		expect(((await response.json()) as any).message).toBe("A workspace can have at most 5 classifiers");
	});

	it("updates and deletes only inside the workspace", async () => {
		const requests = database({ role: "admin" });
		const update = await call(`/classifiers/${CLASSIFIER_ID}`, { method: "PUT", body: JSON.stringify({ workspaceId: WORKSPACE, enabled: false }) });
		expect(update.status).toBe(200);
		expect(((await update.json()) as any).classifier.enabled).toBe(false);
		const remove = await call(`/classifiers/${CLASSIFIER_ID}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		expect(remove.status).toBe(200);
		const writes = requests.filter((entry) => ["PATCH", "DELETE"].includes(entry.method) && entry.url.pathname.endsWith("/workspace_request_classifiers"));
		expect(writes).toHaveLength(2);
		for (const write of writes) {
			expect(write.url.searchParams.get("workspace_id")).toBe(`eq.${WORKSPACE}`);
			expect(write.url.searchParams.get("id")).toBe(`eq.${CLASSIFIER_ID}`);
		}
	});
});

describe("classifier test run", () => {
	const testBody = {
		workspaceId: WORKSPACE,
		classifierId: CLASSIFIER_ID,
		classifier: { model: "google/gemini-2.5-flash-lite", instructions: "Prefer legal for contracts", dimensions: [DEPARTMENT] },
		sample: { prompt: "Review this NDA clause" },
	};

	it("asks the member to review chat privacy first, as Chat does", async () => {
		const requests = database({ role: "admin", reviewed: false });
		const response = await call("/classifiers/test", { method: "POST", body: JSON.stringify(testBody) });
		expect(response.status).toBe(403);
		expect(((await response.json()) as any).error).toBe("chat_privacy_review_required");
		expect(requests.some((entry) => entry.url.hostname === "gateway.test")).toBe(false);
	});

	it("sends the gateway's classification request and returns the labels and cost", async () => {
		const requests = database({
			role: "admin",
			reviewed: true,
			gateway: () => Response.json({ id: "resp_1", model: "google/gemini-2.5-flash-lite", cost_nanos: 42_000, output_text: JSON.stringify({ d0: { value: "legal", confidence: 0.9 } }) }),
		});
		const response = await call("/classifiers/test", { method: "POST", body: JSON.stringify(testBody) });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			labels: [{ key: "department", value: "legal", confidence: 0.9 }],
			answered: true,
			costUsd: 0.000042,
			model: "google/gemini-2.5-flash-lite",
			requestId: "resp_1",
		});
		const sent = requests.find((entry) => entry.url.hostname === "gateway.test")!;
		expect(sent.url.pathname).toBe("/v1/responses");
		expect(sent.headers.get("authorization")).toMatch(/^Bearer phaseo_v1_sk_/);
		expect(JSON.parse(sent.headers.get("x-phaseo-metadata")!)).toEqual({ labels: [{ key: "phaseo.classifier", value: CLASSIFIER_ID }] });
		expect(sent.body.text.format).toMatchObject({ type: "json_schema", strict: true });
		expect(sent.body.text.format.schema.properties.d0.properties.value.enum).toEqual(["engineering", "legal", "other"]);
		expect(sent.body.input[0].content[0].text).toContain("Prefer legal for contracts");
		expect(sent.body.input[1].content[0].text).toBe("<transcript>\nUSER: Review this NDA clause\n</transcript>");
	});

	it("rejects an invalid draft before calling the gateway", async () => {
		const requests = database({ role: "admin", reviewed: true });
		const response = await call("/classifiers/test", { method: "POST", body: JSON.stringify({ ...testBody, classifier: { ...testBody.classifier, dimensions: [] } }) });
		expect(response.status).toBe(400);
		expect(requests.some((entry) => entry.url.hostname === "gateway.test")).toBe(false);
	});

	it("reports a gateway error", async () => {
		database({ role: "admin", reviewed: true, gateway: () => Response.json({ error: { message: "Model does not support structured outputs" } }, { status: 400 }) });
		const response = await call("/classifiers/test", { method: "POST", body: JSON.stringify(testBody) });
		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ error: "classifier_test_failed", status: 400, message: "Model does not support structured outputs" });
	});
});
