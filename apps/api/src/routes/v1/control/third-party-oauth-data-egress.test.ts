import { beforeEach, describe, expect, it, vi } from "vitest";

// Observability destinations, the I/O logging policy, privacy and retention settings, provider keys (BYOK),
// private models, request classifiers, data contribution, webhook endpoints and notification destinations
// decide where a workspace's request content and events go. An app that signs in with Phaseo must not change
// them even when the person consented to the matching write scopes.

const SCOPES = [
	"settings:read", "settings:write",
	"provider_credentials:read", "provider_credentials:write", "provider_credentials:delete",
	"private_models:read", "private_models:write", "private_models:delete",
	"classifiers:read", "classifiers:write", "classifiers:delete",
];

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
	getRequestClassifiersFeatureGateName: () => "request_classifiers",
	isRequestClassifiersAccessEnabled: vi.fn(async () => true),
	isDataContributionAccessEnabled: vi.fn(async () => true),
}));
vi.mock("@/pipeline/before/workspacePolicy", () => ({ bumpWorkspacePolicyVersion: vi.fn(async () => undefined) }));
vi.mock("@/pipeline/before/privateModelCache", () => ({ invalidatePrivateRoutes: vi.fn(async () => undefined) }));
vi.mock("@/pipeline/notifications/notification-delivery", () => ({ deliverNotificationTest: vi.fn(async () => ({ ok: true })) }));
vi.mock("@core/rate-limit-policies", () => ({ publishRateLimitPlan: vi.fn(async () => undefined) }));
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

type Module = "observability" | "provider-credentials" | "webhook-endpoints" | "settings" | "notifications" | "private-models" | "classifiers" | "data-contribution";
type Call = { label: string; module: Module; method: string; path: string; body?: unknown };
const notificationDestination = { type: "custom_webhook", name: "Exfil", target: "https://collector.example.com/events" };

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
	{ label: "turn on I/O logging in settings", module: "settings", method: "PATCH", path: "/", body: { io_logging_enabled: true } },
	{ label: "turn on I/O logging in settings (camelCase)", module: "settings", method: "PATCH", path: "/", body: { ioLoggingEnabled: true } },
	{ label: "include provider payloads in I/O logs", module: "settings", method: "PATCH", path: "/", body: { ioLoggingIncludeProviderPayloads: true } },
	{ label: "turn on input/output logging privacy setting", module: "settings", method: "PATCH", path: "/", body: { privacyEnableInputOutputLogging: true } },
	{ label: "allow providers to train on prompts", module: "settings", method: "PATCH", path: "/", body: { privacy_enable_paid_may_train: true } },
	{ label: "allow free providers to publish prompts", module: "settings", method: "PATCH", path: "/", body: { privacyEnableFreeMayPublishPrompts: true } },
	{ label: "turn off zero data retention", module: "settings", method: "PATCH", path: "/", body: { privacyZdrOnly: false } },
	{ label: "lift provider restrictions", module: "settings", method: "PATCH", path: "/", body: { provider_restriction_mode: "none" } },
	{ label: "change allowed providers", module: "settings", method: "PATCH", path: "/", body: { providerRestrictionProviderIds: ["attacker"] } },
	{ label: "hide I/O logging among other settings", module: "settings", method: "PATCH", path: "/", body: { routing_mode: "price", io_logging_enabled: true } },
	{ label: "change notification settings", module: "notifications", method: "PATCH", path: "/settings", body: { low_balance_enabled: true } },
	{ label: "create a notification destination", module: "notifications", method: "POST", path: "/destinations", body: notificationDestination },
	{ label: "delete a notification destination", module: "notifications", method: "DELETE", path: `/destinations/${ID}` },
	{ label: "test a new notification destination", module: "notifications", method: "POST", path: "/destinations/test", body: notificationDestination },
	{ label: "test a saved notification destination", module: "notifications", method: "POST", path: `/destinations/${ID}/test` },
	{ label: "rotate a notification signing secret", module: "notifications", method: "POST", path: `/destinations/${ID}/rotate-secret` },
	{ label: "route workspace events to a destination", module: "notifications", method: "PUT", path: "/routes/low_balance", body: { destination_ids: [ID] } },
	{ label: "add a private model", module: "private-models", method: "POST", path: "/", body: { model_id: "mine", name: "Mine", base_url: "https://collector.example.com/v1", upstream_model_id: "x" } },
	{ label: "change a private model", module: "private-models", method: "PATCH", path: `/${ID}`, body: { base_url: "https://collector.example.com/v1" } },
	{ label: "delete a private model", module: "private-models", method: "DELETE", path: `/${ID}` },
	{ label: "add a request classifier", module: "classifiers", method: "POST", path: "/", body: { name: "Mine", model: "x", dimensions: [] } },
	{ label: "change a request classifier", module: "classifiers", method: "PATCH", path: `/${ID}`, body: { name: "Mine" } },
	{ label: "delete a request classifier", module: "classifiers", method: "DELETE", path: `/${ID}` },
	{ label: "turn on data contribution", module: "data-contribution", method: "PATCH", path: "/consent", body: { enabled: true } },
	{ label: "add a data contribution classifier", module: "data-contribution", method: "POST", path: "/classifiers", body: { name: "Mine" } },
];

const READS: Call[] = [
	{ label: "list observability destinations", module: "observability", method: "GET", path: "/destinations" },
	{ label: "read the I/O logging policy", module: "observability", method: "GET", path: "/logging-policy" },
	{ label: "list provider keys", module: "provider-credentials", method: "GET", path: "/" },
	{ label: "list webhook endpoints", module: "webhook-endpoints", method: "GET", path: "/" },
	{ label: "read settings", module: "settings", method: "GET", path: "/" },
	{ label: "change only the routing mode", module: "settings", method: "PATCH", path: "/", body: { routing_mode: "price" } },
	{ label: "tighten privacy (zero data retention on, I/O logging off)", module: "settings", method: "PATCH", path: "/", body: { privacyZdrOnly: true, io_logging_enabled: false, privacy_enable_paid_may_train: false } },
	{ label: "list notification destinations", module: "notifications", method: "GET", path: "/destinations" },
	{ label: "list notification routes", module: "notifications", method: "GET", path: "/routes" },
	{ label: "list private models", module: "private-models", method: "GET", path: "/" },
	{ label: "list request classifiers", module: "classifiers", method: "GET", path: "/" },
];

async function call({ module, method, path, body }: Call) {
	const loaders: Record<Module, () => Promise<{ request: (url: string, init: RequestInit, env: object) => Response | Promise<Response> }>> = {
		"observability": async () => (await import("./observability")).observabilityRoutes,
		"provider-credentials": async () => (await import("./provider-credentials")).providerCredentialsRoutes,
		"webhook-endpoints": async () => (await import("./webhook-endpoints")).default,
		"settings": async () => (await import("./settings")).settingsRoutes,
		"notifications": async () => (await import("./notifications")).notificationRoutes,
		"private-models": async () => (await import("./private-models")).privateModelsRoutes,
		"classifiers": async () => (await import("./classifiers")).classifiersRoutes,
		"data-contribution": async () => (await import("./data-contribution")).dataContributionRoutes,
	};
	const routes = await loaders[module]();
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
		// Denials may be audited; nothing else is written.
		expect(state.writes.filter((write) => !write.startsWith("data_contribution_consent_events."))).toEqual([]);
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
