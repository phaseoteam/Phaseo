import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	inserted: null as Record<string, unknown> | null,
	auditEvents: [] as Array<Record<string, unknown>>,
	loggingUpdate: null as Record<string, unknown> | null,
	insertError: null as Record<string, unknown> | null,
}));

const destination = {
	id: "destination_1",
	workspace_id: "workspace_1",
	destination_id: "webhook",
	name: "Production",
	enabled: true,
	privacy_exclude_prompts_and_outputs: true,
	sampling_rate: 0.5,
	group_join_operator: "or",
	include_generation_metadata: true,
	include_cost_metadata: true,
	include_identity_metadata: true,
	include_request_context: true,
	destination_config_ciphertext: "encrypted",
	created_at: "2026-08-30T00:00:00Z",
	updated_at: "2026-08-30T00:00:00Z",
};

function chain(result: Record<string, unknown> = { data: [], error: null, count: 0 }) {
	const value: any = {};
	for (const method of ["select", "eq", "neq", "in", "order", "range", "update", "delete"]) value[method] = () => value;
	value.insert = () => value;
	value.maybeSingle = async () => result;
	value.single = async () => result;
	value.then = (resolve: (input: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
	return value;
}

function supabase() {
	return {
		rpc: async () => ({ data: true, error: null }),
		from(table: string) {
			if (table === "workspace_settings") {
				const row = { workspace_id: "workspace_1", io_logging_enabled: true, io_logging_retention_days: 120, io_logging_include_provider_payloads: false, io_logging_billing_status: "active", io_logging_grace_until: null, io_logging_price_per_million_units_nanos: 0, io_logging_updated_at: "2026-08-30T00:00:00Z" };
				const base = chain({ data: row, error: null });
				base.upsert = (payload: Record<string, unknown>) => {
					state.loggingUpdate = payload;
					return chain({ data: row, error: null });
				};
				return base;
			}
			if (table === "workspace_broadcast_destinations") {
				const base = chain({ data: destination, error: null });
				base.insert = (payload: Record<string, unknown>) => {
					state.inserted = payload;
					return chain(state.insertError ? { data: null, error: state.insertError } : { data: destination, error: null });
				};
				return base;
			}
			if (table === "workspace_audit_events") {
				return {
					insert: async (payload: Record<string, unknown>) => {
						state.auditEvents.push(payload);
						return { error: null };
					},
				};
			}
			if (["broadcast_destination_keys", "broadcast_destination_rule_groups", "broadcast_destination_rules", "keys"].includes(table)) {
				return chain({ data: [], error: null, count: 0 });
			}
			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-encryption-material",
		ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY_VERSION: "v1",
	}),
	getSupabaseAdmin: () => supabase(),
}));

vi.mock("@/pipeline/before/guards", () => ({
	guardManagementAuth: vi.fn(async () => ({
		ok: true,
		value: { workspaceId: "workspace_1", userId: "user_1", apiKeyId: "management_1", requestId: "request_1" },
	})),
}));

vi.mock("./route-helpers", () => ({
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
	internalServerError: (_name: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));

vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

describe("observability destination management", () => {
	beforeEach(() => {
		state.inserted = null;
		state.auditEvents.length = 0;
		state.loggingUpdate = null;
		state.insertError = null;
		vi.resetModules();
	});

	it("creates a destination without persisting plaintext configuration", async () => {
		const { observabilityRoutes } = await import("./observability");
		const response = await observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				type: "webhook",
				name: "Production",
				config: { url: "https://telemetry.example.com/traces", auth_header: "Bearer secret" },
				privacy_mode: true,
				sampling_rate: 0.5,
			}),
		});
		const body = await response.json() as Record<string, any>;

		expect(response.status).toBe(201);
		expect(body.data).toMatchObject({ id: "destination_1", type: "webhook", configured: true });
		expect(body.data.config).toBeUndefined();
		expect(state.inserted).toMatchObject({ destination_config: {}, destination_config_key_version: "v1" });
		expect(state.inserted?.destination_config_ciphertext).not.toContain("Bearer secret");
		expect(state.auditEvents[0]).toMatchObject({ action: "observability.destination.created", target_id: "destination_1" });
	});

	it("rejects private destination endpoints", async () => {
		const { observabilityRoutes } = await import("./observability");
		const response = await observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "webhook", name: "Internal", config: { url: "https://127.0.0.1/traces" } }),
		});
		expect(response.status).toBe(400);
		expect(state.inserted).toBeNull();
	});

	it("rejects destination types without an executable exporter", async () => {
		const { observabilityRoutes } = await import("./observability");
		const response = await observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "langfuse", name: "Unsupported", config: { url: "https://example.com" } }),
		});
		expect(response.status).toBe(400);
	});

	it("reports the per-type destination cap as a bad request", async () => {
		state.insertError = { code: "23514", message: "broadcast_destination_limit_reached" };
		const { observabilityRoutes } = await import("./observability");
		const response = await observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "webhook", name: "Sixth", config: { url: "https://telemetry.example.com/traces" } }),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "destination_limit_reached", message: "Destination limit reached for this type" });
		expect(state.auditEvents).toHaveLength(0);
	});

	it("validates the OTLP endpoint the exporter will call", async () => {
		const { observabilityRoutes } = await import("./observability");
		const create = (config: Record<string, string>) => observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "otel_collector", name: "Collector", config }),
		});
		// The exporter never reads `url` for OTLP, so it cannot stand in for an endpoint.
		expect((await create({ url: "https://collector.example.com" })).status).toBe(400);
		expect((await create({ collector_endpoint: "https://collector.example.com" })).status).toBe(201);
	});

	it("accepts only the supported OTLP protocols", async () => {
		const { observabilityRoutes } = await import("./observability");
		const create = (otlp_protocol: string) => observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "otel_collector", name: "Collector", config: { endpoint: "https://collector.example.com", otlp_protocol } }),
		});
		expect((await create("http/protobuf")).status).toBe(201);
		const rejected = await create("grpc");
		expect(rejected.status).toBe(400);
		expect(await rejected.json()).toMatchObject({ message: "otlp_protocol must be one of: http/json, http/protobuf" });
	});

	it("bounds rule groups and key filters", async () => {
		const { observabilityRoutes } = await import("./observability");
		const response = await observabilityRoutes.request("https://example.com/destinations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ type: "webhook", name: "Invalid", config: { url: "https://example.com" }, rule_groups: Array.from({ length: 11 }, () => ({ match: "and", rules: [] })) }),
		});
		expect(response.status).toBe(400);
	});

	it("updates the I/O logging policy and its privacy gate together", async () => {
		const { observabilityRoutes } = await import("./observability");
		const response = await observabilityRoutes.request("https://example.com/logging-policy", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ enabled: true, retention_days: 120, include_provider_payloads: false }),
		});
		expect(response.status).toBe(200);
		expect(state.loggingUpdate).toMatchObject({
			workspace_id: "workspace_1",
			io_logging_enabled: true,
			privacy_enable_input_output_logging: true,
			io_logging_retention_days: 120,
			io_logging_include_provider_payloads: false,
		});
		expect(state.auditEvents[0]).toMatchObject({ action: "observability.logging_policy.updated" });
	});
});
