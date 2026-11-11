import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const POLICY = "00000000-0000-4000-8000-0000000000a1";
const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
	KEY_PEPPER_ACTIVE: "pepper",
	PHASEO_GATEWAY_URL: "https://gateway.test",
};
const executionCtx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} } as any;

const gatewayPolicy = {
	id: POLICY,
	name: "Website production",
	provider: "vercel",
	issuer: "https://oidc.vercel.com/acme",
	owner_claim: "owner_id",
	owner_id: "team_123",
	claim_conditions: { project_id: ["prj_web"], environment: ["production"] },
	max_token_lifetime_seconds: 43200,
	status: "active",
	audience: "https://api.phaseo.app",
	key_id: "key-1",
	last_used_at: "2026-10-26T10:00:00Z",
	created_by: "user-a",
	created_at: "2026-10-26T09:00:00Z",
	updated_at: "2026-10-26T09:30:00Z",
};

type Fixture = { role?: string | null; gateway?: (request: Request) => Response | Promise<Response> };

function database(fixture: Fixture = {}) {
	const requests: Array<{ url: URL; method: string; body: any; headers: Headers }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(String(input), init);
		const url = new URL(request.url);
		const text = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
		requests.push({ url, method: request.method, body: text ? JSON.parse(text) : null, headers: request.headers });
		if (url.hostname === "gateway.test") return fixture.gateway ? fixture.gateway(request) : new Response("{}", { status: 500 });
		if (url.pathname.endsWith("/auth/v1/user")) return Response.json({ id: "user-a", email: "fixture@example.com", app_metadata: {} });
		if (url.pathname.endsWith("/workspace_members")) return Response.json(fixture.role ? [{ role: fixture.role }] : []);
		if (url.pathname.endsWith("/workspaces")) return Response.json([{ owner_user_id: "owner", slug: "workspace-a", name: "Workspace A" }]);
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

describe("trusted workloads settings reads", () => {
	it("rejects a workspace the user does not belong to", async () => {
		const requests = database({ role: null });
		expect((await call(`/trusted-workloads?workspaceId=${WORKSPACE}`)).status).toBe(403);
		expect(requests.some((request) => request.url.hostname === "gateway.test")).toBe(false);
	});

	it("shows members the page without reading policies", async () => {
		const requests = database({ role: "member" });
		const response = await call(`/trusted-workloads?workspaceId=${WORKSPACE}`);
		await expect(response.json()).resolves.toMatchObject({ workspaceId: WORKSPACE, available: true, canManage: false, policies: [] });
		expect(requests.some((request) => request.url.hostname === "gateway.test")).toBe(false);
	});

	it("returns the gateway's policies for admins, read with their session", async () => {
		const requests = database({ role: "admin", gateway: () => Response.json({ data: [gatewayPolicy], audience: "https://api.phaseo.app" }) });
		const response = await call(`/trusted-workloads?workspaceId=${WORKSPACE}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toContain("no-store");
		await expect(response.json()).resolves.toEqual({
			workspaceId: WORKSPACE,
			available: true,
			canManage: true,
			audience: "https://api.phaseo.app",
			policies: [{
				id: POLICY,
				name: "Website production",
				provider: "vercel",
				issuer: "https://oidc.vercel.com/acme",
				ownerClaim: "owner_id",
				ownerId: "team_123",
				claimConditions: { project_id: ["prj_web"], environment: ["production"] },
				maxTokenLifetimeSeconds: 43200,
				status: "active",
				lastUsedAt: "2026-10-26T10:00:00Z",
				createdAt: "2026-10-26T09:00:00Z",
				updatedAt: "2026-10-26T09:30:00Z",
			}],
		});
		const forwarded = requests.find((request) => request.url.hostname === "gateway.test");
		expect(forwarded?.url.pathname).toBe("/v1/workload-identity/policies");
		expect(forwarded?.headers.get("authorization")).toBe("Bearer fixture-token");
		expect(forwarded?.headers.get("x-phaseo-workspace-id")).toBe(WORKSPACE);
	});

	it("passes every platform and the owner claim through, leaving out platforms it does not know", async () => {
		const policy = (provider: string, issuer: string, ownerClaim: string, ownerId: string) => ({ ...gatewayPolicy, provider, issuer, owner_claim: ownerClaim, owner_id: ownerId, claim_conditions: {} });
		const rows = [
			policy("github_actions", "https://token.actions.githubusercontent.com", "repository_owner_id", "42"),
			policy("gitlab", "https://gitlab.com", "project_id", "12345"),
			policy("google_cloud", "https://accounts.google.com", "sub", "104523456789012345678"),
			policy("buildkite", "https://agent.buildkite.com", "organization_id", "0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"),
			policy("circleci", "https://oidc.circleci.com/org/0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f", "oidc.circleci.com/org-id", "0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"),
			policy("aws", "https://0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f.tokens.sts.global.api.aws", "sub", "arn:aws:iam::123456789012:role/evals"),
			policy("custom", "https://k8s.example.com", "sub", "system:serviceaccount:default:app"),
			policy("azure", "https://login.example.com", "sub", "x"),
		];
		database({ role: "owner", gateway: () => Response.json({ data: rows, audience: "https://api.phaseo.app" }) });
		const body = await (await call(`/trusted-workloads?workspaceId=${WORKSPACE}`)).json() as { policies: Array<Record<string, unknown>> };
		expect(body.policies.map((entry) => [entry.provider, entry.ownerClaim, entry.ownerId])).toEqual([
			["github_actions", "repository_owner_id", "42"],
			["gitlab", "project_id", "12345"],
			["google_cloud", "sub", "104523456789012345678"],
			["buildkite", "organization_id", "0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"],
			["circleci", "oidc.circleci.com/org-id", "0b9f7c5e-1a2b-4c3d-8e9f-0a1b2c3d4e5f"],
			["aws", "sub", "arn:aws:iam::123456789012:role/evals"],
			["custom", "sub", "system:serviceaccount:default:app"],
		]);
	});

	it("reports workspaces outside the rollout as unavailable", async () => {
		database({ role: "owner", gateway: () => Response.json({ error: "not_found" }, { status: 404 }) });
		await expect((await call(`/trusted-workloads?workspaceId=${WORKSPACE}`)).json()).resolves.toMatchObject({ available: false, canManage: false });
	});

	it("reports the page as unavailable when the gateway fails", async () => {
		database({ role: "owner", gateway: () => Response.json({ error: "boom" }, { status: 500 }) });
		expect((await call(`/trusted-workloads?workspaceId=${WORKSPACE}`)).status).toBe(503);
	});
});

describe("trusted workloads settings writes", () => {
	it("forwards creates, updates and deletes to the gateway without the workspaceId field", async () => {
		const requests = database({ role: "owner", gateway: () => Response.json({ data: { id: POLICY } }, { status: 201 }) });
		const create = await call("/trusted-workloads/policies", {
			method: "POST",
			body: JSON.stringify({ workspaceId: WORKSPACE, name: "Cluster", provider: "custom", issuer: "https://k8s.example.com", owner_claim: "sub", owner_id: "system:serviceaccount:default:app" }),
		});
		expect(create.status).toBe(201);
		await expect(create.json()).resolves.toEqual({ ok: true, id: POLICY });
		await call(`/trusted-workloads/policies/${POLICY.toUpperCase()}`, { method: "PATCH", body: JSON.stringify({ workspaceId: WORKSPACE, status: "disabled" }) });
		await call(`/trusted-workloads/policies/${POLICY}`, { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) });
		const forwarded = requests.filter((request) => request.url.hostname === "gateway.test");
		expect(forwarded.map((request) => `${request.method} ${request.url.pathname}`)).toEqual([
			"POST /v1/workload-identity/policies",
			`PATCH /v1/workload-identity/policies/${POLICY}`,
			`DELETE /v1/workload-identity/policies/${POLICY}`,
		]);
		expect(forwarded[0].body).toEqual({ name: "Cluster", provider: "custom", issuer: "https://k8s.example.com", owner_claim: "sub", owner_id: "system:serviceaccount:default:app" });
		expect(forwarded[1].body).toEqual({ status: "disabled" });
		expect(forwarded[2].body).toBeNull();
		for (const request of forwarded) expect(request.headers.get("x-phaseo-workspace-id")).toBe(WORKSPACE);
	});

	it("passes the gateway's validation errors through", async () => {
		const error = { error: "bad_request", message: "Invalid trust policy", errors: ['claim "owner_id" is required for vercel policies'] };
		database({ role: "owner", gateway: () => Response.json(error, { status: 400 }) });
		const response = await call("/trusted-workloads/policies", { method: "POST", body: JSON.stringify({ workspaceId: WORKSPACE, provider: "vercel" }) });
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ ...error, message: 'claim "owner_id" is required for vercel policies' });
	});

	it("rejects malformed policy ids before calling the gateway", async () => {
		const requests = database({ role: "owner" });
		expect((await call("/trusted-workloads/policies/not-a-uuid", { method: "DELETE", body: JSON.stringify({ workspaceId: WORKSPACE }) })).status).toBe(400);
		expect(requests.some((request) => request.url.hostname === "gateway.test")).toBe(false);
	});
});
