import { beforeEach, describe, expect, it, vi } from "vitest";

// Observability destinations, the I/O logging policy, provider keys (BYOK) and webhook endpoints decide
// where a workspace's request content and events go. An app that signs in with Phaseo must not change
// them even when the person consented to settings:write or provider_credentials:write.

const SCOPES = ["settings:read", "settings:write", "provider_credentials:read", "provider_credentials:write", "provider_credentials:delete"];

const state = vi.hoisted(() => ({
	auth: null as any,
	writes: [] as string[],
}));

function query(table: string) {
	const q: any = {};
	for (const method of ["select", "eq", "neq", "in", "is", "or", "order", "range", "limit", "not", "gt", "lt"]) q[method] = () => q;
	for (const method of ["insert", "update", "upsert", "delete"]) q[method] = () => { state.writes.push(`${table}.${method}`); return q; };
	const result = table === "workspace_members" ? { data: { role: "admin" }, error: null } : { data: null, count: 0, error: null };
	q.maybeSingle = async () => result;
	q.single = async () => result;
	q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
		Promise.resolve(table === "workspace_members" ? result : { data: [], count: 0, error: null }).then(resolve, reject);
	return q;
}

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/runtime/env", () => ({
	configureRuntime: vi.fn(),
	clearRuntime: vi.fn(),
	getBindings: () => ({}),
	getSupabaseAdmin: () => ({ from: (table: string) => query(table), rpc: vi.fn(async () => ({ data: null, error: null })) }),
}));
vi.mock("@/core/kv", () => ({ setKeyVersion: vi.fn(async () => 1) }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn(async () => true) }));
vi.mock("@core/feature-flags", () => ({
	getBatchApiFeatureGateName: () => "gateway_batch_api",
	isBatchApiAccessEnabled: vi.fn(async () => true),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

function oauthCaller(clientId: string) {
	return {
		ok: true,
		value: {
			workspaceId: "00000000-0000-4000-8000-000000000010",
			userId: "00000000-0000-4000-8000-000000000020",
			apiKeyId: "00000000-0000-4000-8000-000000000030",
			apiKeyRef: "oauth",
			apiKeyKid: "kid_oauth",
			internal: false,
			authMethod: "oauth",
			oauthClientId: clientId,
			scopes: SCOPES,
			oauthScopes: SCOPES,
			requestId: "request_1",
		},
	};
}

const ID = "00000000-0000-4000-8000-000000000001";
const destination = { type: "webhook", name: "Exfil", config: { url: "https://collector.example.com/traces" } };
const credential = { provider_id: "openai", name: "Mine", value: "sk-attacker-key" };

type Call = { label: string; module: "observability" | "provider-credentials" | "webhook-endpoints"; method: string; path: string; body?: unknown };

const WRITES: Call[] = [
	{ label: "create an observability destination", module: "observability", method: "POST", path: "/destinations", body: destination },
	{ label: "change an observability destination", module: "observability", method: "PATCH", path: `/destinations/${ID}`, body: { config: destination.config } },
	{ label: "delete an observability destination", module: "observability", method: "DELETE", path: `/destinations/${ID}` },
	{ label: "change the I/O logging policy", module: "observability", method: "PATCH", path: "/logging-policy", body: { enabled: true } },
	{ label: "add a provider key", module: "provider-credentials", method: "POST", path: "/", body: credential },
	{ label: "change a provider key", module: "provider-credentials", method: "PATCH", path: `/${ID}`, body: { value: "sk-attacker-key" } },
	{ label: "reorder provider keys", module: "provider-credentials", method: "POST", path: "/reorder", body: { provider_id: "openai", ids: [ID] } },
	{ label: "delete a provider key", module: "provider-credentials", method: "DELETE", path: `/${ID}` },
	{ label: "create a webhook endpoint", module: "webhook-endpoints", method: "POST", path: "/", body: { url: "https://collector.example.com/hook" } },
	{ label: "change a webhook endpoint", module: "webhook-endpoints", method: "PATCH", path: `/${ID}`, body: { url: "https://collector.example.com/hook" } },
	{ label: "rotate a webhook secret", module: "webhook-endpoints", method: "POST", path: `/${ID}/rotate-secret` },
	{ label: "test a webhook endpoint", module: "webhook-endpoints", method: "POST", path: `/${ID}/test` },
	{ label: "delete a webhook endpoint", module: "webhook-endpoints", method: "DELETE", path: `/${ID}` },
];

const READS: Call[] = [
	{ label: "list observability destinations", module: "observability", method: "GET", path: "/destinations" },
	{ label: "read the I/O logging policy", module: "observability", method: "GET", path: "/logging-policy" },
	{ label: "list provider keys", module: "provider-credentials", method: "GET", path: "/" },
	{ label: "list webhook endpoints", module: "webhook-endpoints", method: "GET", path: "/" },
];

async function call({ module, method, path, body }: Call) {
	const routes = module === "observability"
		? (await import("./observability")).observabilityRoutes
		: module === "provider-credentials"
			? (await import("./provider-credentials")).providerCredentialsRoutes
			: (await import("./webhook-endpoints")).default;
	const response = await routes.request(`https://example.com${path}`, {
		method,
		...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
	}, {});
	const text = await response.text();
	return { status: response.status, text };
}

describe("apps that sign in with Phaseo cannot redirect workspace data", () => {
	beforeEach(() => {
		state.writes.length = 0;
		vi.resetModules();
	});

	it.each(WRITES)("a third-party app cannot $label", async (request) => {
		state.auth = oauthCaller("acme_reporting_app");
		const { status, text } = await call(request);
		expect(status).toBe(403);
		expect(text).toContain("Apps that use Sign in with Phaseo can't");
		expect(state.writes).toEqual([]);
	});

	it.each(READS)("a third-party app can still $label", async (request) => {
		state.auth = oauthCaller("acme_reporting_app");
		const { text } = await call(request);
		expect(text).not.toContain("Apps that use Sign in with Phaseo can't");
	});

	it.each(WRITES)("Phaseo's own CLI is not refused when it tries to $label", async (request) => {
		state.auth = oauthCaller("phaseo_cli");
		const { text } = await call(request);
		expect(text).not.toContain("Apps that use Sign in with Phaseo can't");
	});

	it.each(WRITES)("a management key is not refused when it tries to $label", async (request) => {
		state.auth = { ok: true, value: { ...oauthCaller("").value, authMethod: "api_key", oauthClientId: null, apiKeyRef: "kid_mgmt" } };
		const { text } = await call(request);
		expect(text).not.toContain("Apps that use Sign in with Phaseo can't");
	});
});
