import { beforeEach, describe, expect, it, vi } from "vitest";

// The allowed side of third-party-oauth-data-egress.test.ts: a management key and the person's dashboard
// session make the same changes successfully, with what they asked for persisted, and apps keep read access.

const WS = "00000000-0000-4000-8000-000000000010";
const USER = "00000000-0000-4000-8000-000000000020";
const ID = "00000000-0000-4000-8000-000000000001";
const SCOPES = [
	"settings:read", "settings:write",
	"provider_credentials:read", "provider_credentials:write", "provider_credentials:delete",
	"private_models:read", "private_models:write", "private_models:delete",
	"classifiers:read", "classifiers:write", "classifiers:delete",
];

type Write = { table: string; op: string; payload?: unknown };
const state = vi.hoisted(() => ({
	auth: null as any,
	writes: [] as Write[],
	rpcs: [] as Array<{ name: string; args: unknown }>,
}));

// Rows that exist: returned when a query asks for the row by id, or for the per-workspace tables below.
const ROWS: Record<string, Record<string, unknown>> = {
	workspace_members: { workspace_id: WS, user_id: USER, role: "owner" },
	users: { user_id: USER, role: "admin" },
	workspaces: { id: WS, owner_user_id: USER, slug: "ws", name: "Workspace", tier: "enterprise" },
	wallets: { workspace_id: WS, auto_top_up_enabled: false },
	workspace_settings: { workspace_id: WS, io_logging_enabled: false, io_logging_retention_days: 90, io_logging_include_provider_payloads: false, io_logging_billing_status: "active", data_contribution_enabled: false },
	workspace_broadcast_destinations: { id: ID, workspace_id: WS, destination_id: "webhook", name: "Production", enabled: true, sampling_rate: 1, group_join_operator: "or", destination_config_ciphertext: "x", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
	byok_keys: { id: ID, workspace_id: WS, provider_id: "openai", name: "Production", enabled: true, routing_mode: "priority", sort_order: 0, prefix: "sk-pro", suffix: "cret" },
	gateway_webhook_endpoints: { id: ID, workspace_id: WS, name: "Hooks", url: "https://hooks.example.com/phaseo", events: ["video.completed"], status: "active", secret_ciphertext: "x", secret_iv: "x", secret_key_version: "v1", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null },
	notification_destinations: { id: ID, workspace_id: WS, name: "Ops", type: "custom_webhook", status: "active", target_ciphertext: "x", target_preview: "hooks.example.com", signing_secret_ciphertext: "x", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
	workspace_private_models: { id: ID, workspace_id: WS, model_id: "private/ws/mine", slug: "mine", name: "Mine", base_url: "https://models.example.com/v1", upstream_model_id: "m", status: "active", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
	workspace_request_classifiers: { id: ID, workspace_id: WS, name: "Intent", model: "openai/gpt-5-nano", dimensions: [{ key: "intent", values: ["a", "b"] }], sample_rate_bps: 100, enabled: true, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" },
	workspace_classifiers: { id: ID, workspace_id: WS, name: "Starter", slug: "starter", enabled: true },
	keys: { id: ID, workspace_id: WS, status: "active" },
};
const ALWAYS = new Set(["workspace_members", "users", "workspaces", "wallets", "workspace_settings"]);

function query(table: string) {
	let wrote: Record<string, unknown> | null = null;
	let byId = false;
	const q: any = {};
	for (const method of ["select", "neq", "in", "is", "or", "order", "range", "limit", "not", "gt", "gte", "lt", "lte", "match"]) q[method] = () => q;
	q.eq = (_column: string, value: unknown) => { if (value === ID) byId = true; return q; };
	for (const op of ["insert", "update", "upsert", "delete"]) {
		q[op] = (payload?: unknown) => {
			state.writes.push({ table, op, payload });
			wrote = { ...(ROWS[table] ?? {}), ...(payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {}) };
			if (!wrote.id) wrote.id = ID;
			return q;
		};
	}
	const row = () => wrote ?? (ALWAYS.has(table) || byId ? ROWS[table] ?? null : null);
	q.maybeSingle = async () => ({ data: row(), error: null });
	q.single = async () => ({ data: row(), error: null });
	q.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
		const data = wrote ? [wrote] : ROWS[table] ? [ROWS[table]] : [];
		return Promise.resolve({ data, count: data.length, error: null }).then(resolve, reject);
	};
	return q;
}

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/runtime/env", () => ({
	configureRuntime: vi.fn(),
	clearRuntime: vi.fn(),
	getBindings: () => ({ ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-encryption-material-0123456789", ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "v1" }),
	getSupabaseAdmin: () => ({
		from: (table: string) => query(table),
		rpc: vi.fn(async (name: string, args: unknown) => {
			state.rpcs.push({ name, args });
			if (name === "save_workspace_baseline_guardrail") return { data: { id: "baseline" }, error: null };
			if (name === "reorder_workspace_byok_credentials") return { data: [ROWS.byok_keys], error: null };
			if (name === "set_notification_event_destinations") return { data: [ID], error: null };
			if (name === "set_data_contribution_consent") return { data: { enabled: true }, error: null };
			return { data: true, error: null };
		}),
	}),
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
vi.mock("@/core/provider-credentials", () => ({
	canonicalProviderId: (value: unknown) => String(value ?? "").trim().toLowerCase(),
	normalizeCredentialScope: (value: unknown) => Array.isArray(value) ? value.map(String) : null,
	validateProviderCredential: (_provider: string, value: unknown) => ({ value: String(value), strict: true }),
	encryptProviderCredential: vi.fn(async () => ({ enc_value: "encrypted", enc_iv: "iv", enc_tag: "tag", key_version: 1, fingerprint_sha256: "fp", prefix: "sk-pro", suffix: "cret" })),
}));
vi.mock("@core/webhook-endpoints", async (importOriginal) => ({
	...(await importOriginal<typeof import("@core/webhook-endpoints")>()),
	validateWebhookEndpointUrlForDelivery: vi.fn(async (url: string) => url),
}));
vi.mock("./notification-target", async (importOriginal) => ({
	...(await importOriginal<typeof import("./notification-target")>()),
	validateNotificationTarget: vi.fn((_type: string, target: unknown) => target),
	encryptNotificationTarget: vi.fn(async () => ({ ciphertext: "x", iv: "x", keyVersion: "v1" })),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

const base = { workspaceId: WS, userId: USER, apiKeyId: "caller", apiKeyKid: "kid", internal: false, scopes: SCOPES, oauthScopes: SCOPES, requestId: "request_1" };
const CALLERS = {
	"a management key": { ok: true, value: { ...base, authMethod: "api_key", oauthClientId: null, apiKeyRef: "kid_mgmt" } },
	"the person's dashboard session": { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: null, apiKeyRef: "dashboard" } },
};
const APP = { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "acme_reporting_app", apiKeyRef: "oauth_acme_reporting_app" } };

type Module = "observability" | "provider-credentials" | "webhook-endpoints" | "settings" | "notifications" | "private-models" | "classifiers";
type Call = { label: string; module: Module; method: string; path: string; body?: unknown; persists: { table?: string; op?: string; rpc?: string; includes?: Record<string, unknown> } };

const destination = { type: "webhook", name: "Production", config: { url: "https://telemetry.example.com/traces" } };
const WRITES: Call[] = [
	{ label: "create an observability destination", module: "observability", method: "POST", path: "/destinations", body: destination, persists: { table: "workspace_broadcast_destinations", op: "insert", includes: { destination_id: "webhook", name: "Production" } } },
	{ label: "change an observability destination", module: "observability", method: "PATCH", path: `/destinations/${ID}`, body: { name: "Renamed" }, persists: { table: "workspace_broadcast_destinations", op: "update", includes: { name: "Renamed" } } },
	{ label: "delete an observability destination", module: "observability", method: "DELETE", path: `/destinations/${ID}`, persists: { table: "workspace_broadcast_destinations", op: "delete" } },
	{ label: "change the I/O logging policy", module: "observability", method: "PATCH", path: "/logging-policy", body: { enabled: true }, persists: { table: "workspace_settings", op: "upsert", includes: { io_logging_enabled: true } } },
	{ label: "add a provider key", module: "provider-credentials", method: "POST", path: "/", body: { provider_id: "openai", name: "Mine", value: "sk-proj-0123456789" }, persists: { table: "byok_keys", op: "insert", includes: { provider_id: "openai", name: "Mine" } } },
	{ label: "change a provider key", module: "provider-credentials", method: "PATCH", path: `/${ID}`, body: { name: "Renamed" }, persists: { table: "byok_keys", op: "update", includes: { name: "Renamed" } } },
	{ label: "delete a provider key", module: "provider-credentials", method: "DELETE", path: `/${ID}`, persists: { table: "byok_keys", op: "delete" } },
	{ label: "create a webhook endpoint", module: "webhook-endpoints", method: "POST", path: "/", body: { url: "https://hooks.example.com/phaseo" }, persists: { table: "gateway_webhook_endpoints", op: "insert", includes: { workspace_id: WS, name: "Async webhooks" } } },
	{ label: "change a webhook endpoint", module: "webhook-endpoints", method: "PATCH", path: `/${ID}`, body: { name: "Renamed" }, persists: { table: "gateway_webhook_endpoints", op: "update", includes: { name: "Renamed" } } },
	{ label: "rotate a webhook secret", module: "webhook-endpoints", method: "POST", path: `/${ID}/rotate-secret`, persists: { table: "gateway_webhook_endpoints", op: "update" } },
	{ label: "delete a webhook endpoint", module: "webhook-endpoints", method: "DELETE", path: `/${ID}`, persists: { table: "gateway_webhook_endpoints", op: "update" } },
	{ label: "turn on I/O logging in settings", module: "settings", method: "PATCH", path: "/", body: { ioLoggingEnabled: true }, persists: { table: "workspace_settings", op: "upsert", includes: { io_logging_enabled: true } } },
	{ label: "lift provider restrictions in settings", module: "settings", method: "PATCH", path: "/", body: { providerRestrictionMode: "none" }, persists: { rpc: "save_workspace_baseline_guardrail", includes: { p_settings: { provider_restriction_mode: "none" } } } },
	{ label: "create a notification destination", module: "notifications", method: "POST", path: "/destinations", body: { type: "custom_webhook", name: "Ops", target: "https://hooks.example.com/events" }, persists: { table: "notification_destinations", op: "insert", includes: { type: "custom_webhook", name: "Ops" } } },
	{ label: "delete a notification destination", module: "notifications", method: "DELETE", path: `/destinations/${ID}`, persists: { table: "notification_destinations", op: "update", includes: { status: "deleted" } } },
	{ label: "route workspace events to a destination", module: "notifications", method: "PUT", path: "/routes/low_balance", body: { destination_ids: [ID] }, persists: { rpc: "set_notification_event_destinations" } },
	{ label: "delete a private model", module: "private-models", method: "DELETE", path: `/${ID}`, persists: { table: "workspace_private_models" } },
	{ label: "change a request classifier", module: "classifiers", method: "PATCH", path: `/${ID}`, body: { name: "Renamed" }, persists: { table: "workspace_request_classifiers", op: "update", includes: { name: "Renamed" } } },
	{ label: "delete a request classifier", module: "classifiers", method: "DELETE", path: `/${ID}`, persists: { table: "workspace_request_classifiers", op: "delete" } },
];

const READS: Array<Omit<Call, "persists">> = [
	{ label: "list observability destinations", module: "observability", method: "GET", path: "/destinations" },
	{ label: "read the I/O logging policy", module: "observability", method: "GET", path: "/logging-policy" },
	{ label: "list provider keys", module: "provider-credentials", method: "GET", path: "/" },
	{ label: "list webhook endpoints", module: "webhook-endpoints", method: "GET", path: "/" },
	{ label: "read settings", module: "settings", method: "GET", path: "/" },
	{ label: "list notification destinations", module: "notifications", method: "GET", path: "/destinations" },
	{ label: "list private models", module: "private-models", method: "GET", path: "/" },
	{ label: "list request classifiers", module: "classifiers", method: "GET", path: "/" },
];

async function call({ module, method, path, body }: { module: Module; method: string; path: string; body?: unknown }) {
	const loaders: Record<Module, () => Promise<{ request: (url: string, init: RequestInit, env: object) => Response | Promise<Response> }>> = {
		"observability": async () => (await import("./observability")).observabilityRoutes,
		"provider-credentials": async () => (await import("./provider-credentials")).providerCredentialsRoutes,
		"webhook-endpoints": async () => (await import("./webhook-endpoints")).default,
		"settings": async () => (await import("./settings")).settingsRoutes,
		"notifications": async () => (await import("./notifications")).notificationRoutes,
		"private-models": async () => (await import("./private-models")).privateModelsRoutes,
		"classifiers": async () => (await import("./classifiers")).classifiersRoutes,
	};
	const routes = await loaders[module]();
	const response = await routes.request(`https://example.com${path}`, {
		method,
		...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
	}, {});
	return { status: response.status, body: await response.json().catch(() => null) as any };
}

describe("people and management keys still change where workspace data goes", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.rpcs.length = 0;
		vi.resetModules();
	});

	for (const [caller, auth] of Object.entries(CALLERS)) {
		it.each(WRITES)(`${caller} can $label`, async (request) => {
			state.auth = auth;
			const { status, body } = await call(request);
			expect(status, JSON.stringify(body)).toBeGreaterThanOrEqual(200);
			expect(status, JSON.stringify(body)).toBeLessThan(300);
			const { table, op, rpc, includes } = request.persists;
			if (rpc) {
				const made = state.rpcs.find((entry) => entry.name === rpc);
				expect(made, `rpc ${rpc}`).toBeDefined();
				if (includes) expect(made?.args).toMatchObject(includes);
			} else {
				const write = state.writes.find((entry) => entry.table === table && (!op || entry.op === op));
				expect(write, `${op ?? "write"} on ${table}: ${JSON.stringify(state.writes.map((entry) => `${entry.table}.${entry.op}`))}`).toBeDefined();
				if (includes) expect(write?.payload).toMatchObject(includes);
			}
		});
	}

	it.each(READS)("a third-party app can still $label", async (request) => {
		state.auth = APP;
		const { status, body } = await call(request);
		expect(status, JSON.stringify(body)).toBe(200);
		expect(state.writes).toEqual([]);
	});
});

// PATCH /v1/control/settings, field by field and through both spellings. Apps may tighten content handling
// but not loosen it; what the check sees is what gets saved.
const CONTENT_FIELDS: Array<{ snake: string; camel: string; tighten: unknown; widen: unknown; baseline: boolean }> = [
	{ snake: "io_logging_enabled", camel: "ioLoggingEnabled", tighten: false, widen: true, baseline: false },
	{ snake: "io_logging_include_provider_payloads", camel: "ioLoggingIncludeProviderPayloads", tighten: false, widen: true, baseline: false },
	{ snake: "privacy_enable_input_output_logging", camel: "privacyEnableInputOutputLogging", tighten: false, widen: true, baseline: true },
	{ snake: "privacy_enable_paid_may_train", camel: "privacyEnablePaidMayTrain", tighten: false, widen: true, baseline: true },
	{ snake: "privacy_enable_free_may_train", camel: "privacyEnableFreeMayTrain", tighten: false, widen: true, baseline: true },
	{ snake: "privacy_enable_free_may_publish_prompts", camel: "privacyEnableFreeMayPublishPrompts", tighten: false, widen: true, baseline: true },
	{ snake: "privacy_zdr_only", camel: "privacyZdrOnly", tighten: true, widen: false, baseline: true },
	{ snake: "provider_restriction_mode", camel: "providerRestrictionMode", tighten: undefined, widen: "none", baseline: true },
	{ snake: "provider_restriction_provider_ids", camel: "providerRestrictionProviderIds", tighten: undefined, widen: ["openai"], baseline: true },
	{ snake: "provider_restriction_enforce_allowed", camel: "providerRestrictionEnforceAllowed", tighten: undefined, widen: true, baseline: true },
];
const settingsPatch = (body: Record<string, unknown>) => call({ module: "settings", method: "PATCH", path: "/", body });
const persistedSettings = () => ({
	...((state.writes.find((entry) => entry.table === "workspace_settings" && entry.op === "upsert")?.payload ?? {}) as Record<string, unknown>),
	...(((state.rpcs.find((entry) => entry.name === "save_workspace_baseline_guardrail")?.args as any)?.p_settings ?? {}) as Record<string, unknown>),
});
const CLI = { ok: true, value: { ...base, authMethod: "oauth", oauthClientId: "phaseo_cli", apiKeyRef: "oauth_phaseo_cli" } };

describe("settings: apps can tighten content handling but not loosen it", () => {
	beforeEach(() => {
		state.writes.length = 0;
		state.rpcs.length = 0;
		vi.resetModules();
	});

	const aliases = CONTENT_FIELDS.flatMap((field) => [field.snake, field.camel].map((key) => ({ ...field, key })));

	it.each(aliases)("refuses an app loosening $key", async ({ key, widen }) => {
		for (const auth of [APP, CLI]) {
			state.writes.length = 0;
			state.rpcs.length = 0;
			state.auth = auth;
			const { status, body } = await settingsPatch({ [key]: widen });
			expect(status, JSON.stringify(body)).toBe(403);
			expect(String(body?.message)).toMatch(auth === APP ? /^Apps that use Sign in with Phaseo can't/ : /Phaseo CLI or desktop app sign-in/);
			expect(state.writes).toEqual([]);
			expect(state.rpcs).toEqual([]);
		}
	});

	it.each(aliases.filter((field) => field.tighten !== undefined))("lets an app tighten $key, and saves it", async ({ key, snake, tighten, baseline }) => {
		state.auth = APP;
		const { status, body } = await settingsPatch({ [key]: tighten });
		expect(status, JSON.stringify(body)).toBe(200);
		expect(persistedSettings()).toMatchObject({ [snake]: tighten });
		expect(Boolean(state.rpcs.find((entry) => entry.name === "save_workspace_baseline_guardrail"))).toBe(baseline);
	});

	it.each(aliases)("lets a management key loosen $key, and saves it", async ({ key, snake, widen }) => {
		state.auth = CALLERS["a management key"];
		const { status, body } = await settingsPatch({ [key]: widen });
		expect(status, JSON.stringify(body)).toBe(200);
		expect(persistedSettings()).toMatchObject({ [snake]: widen });
	});

	it("refuses a patch that tightens one field and loosens another", async () => {
		state.auth = APP;
		for (const body of [
			{ privacyZdrOnly: true, io_logging_enabled: true },
			{ io_logging_enabled: false, privacy_enable_paid_may_train: true },
			{ routing_mode: "price", providerRestrictionMode: "allowlist" },
		]) {
			state.writes.length = 0;
			state.rpcs.length = 0;
			expect((await settingsPatch(body)).status, JSON.stringify(body)).toBe(403);
			expect(state.writes).toEqual([]);
			expect(state.rpcs).toEqual([]);
		}
	});

	it("rejects null, string and number values before anything is saved", async () => {
		for (const auth of [APP, CALLERS["a management key"]]) {
			for (const value of [null, "false", "true", 0, 1]) {
				state.writes.length = 0;
				state.rpcs.length = 0;
				state.auth = auth;
				const { status } = await settingsPatch({ io_logging_enabled: value });
				expect(status, String(value)).toBe(400);
				expect(state.writes).toEqual([]);
				expect(state.rpcs).toEqual([]);
			}
		}
	});

	it("judges conflicting spellings by the value that would be saved", async () => {
		state.auth = APP;
		expect((await settingsPatch({ io_logging_enabled: false, ioLoggingEnabled: true })).status).toBe(403);
		expect(state.writes).toEqual([]);

		const { status } = await settingsPatch({ ioLoggingEnabled: true, io_logging_enabled: false });
		expect(status).toBe(200);
		expect(persistedSettings()).toMatchObject({ io_logging_enabled: false });
	});

	it("lets an app change settings that don't touch content handling", async () => {
		state.auth = APP;
		const { status } = await settingsPatch({ routing_mode: "price", privacyZdrOnly: true, io_logging_enabled: false });
		expect(status).toBe(200);
		expect(persistedSettings()).toMatchObject({ routing_mode: "price", privacy_zdr_only: true, io_logging_enabled: false });
	});
});
