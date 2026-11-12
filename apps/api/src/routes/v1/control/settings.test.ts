import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	patch: null as Record<string, unknown> | null,
	rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
	rpcError: null as { message: string } | null,
	policyBumps: 0,
	audits: [] as Array<Record<string, unknown>>,
	invalidations: [] as string[],
}));

function chain(row: Record<string, unknown>) {
	const value: any = {};
	for (const method of ["select", "eq", "neq"]) value[method] = () => value;
	value.maybeSingle = async () => ({ data: row, error: null });
	value.then = (resolve: (input: unknown) => unknown) => Promise.resolve(resolve({ data: [{ id: "key_1" }], error: null }));
	return value;
}

function supabase() {
	return {
		rpc: async (name: string, args: Record<string, unknown>) => {
			state.rpcCalls.push({ name, args });
			return { data: state.rpcError ? null : { id: "baseline_1" }, error: state.rpcError };
		},
		from(table: string) {
			if (table === "workspace_settings") {
				const base = chain({ workspace_id: "workspace_1", routing_mode: "latency", beta_channel_enabled: false, alpha_channel_enabled: false, response_healing_enabled: true, response_healing_locked: true, response_healing_mode: "safe" });
				base.upsert = (patch: Record<string, unknown>) => { state.patch = patch; return base; };
				return base;
			}
			if (table === "keys") return chain({});
			if (table === "workspace_audit_events") return { insert: async (payload: Record<string, unknown>) => { state.audits.push(payload); return { error: null }; } };
			throw new Error(`Unexpected table: ${table}`);
		},
	};
}

vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => supabase() }));
vi.mock("@/core/kv", () => ({ setKeyVersion: async (_kind: string, id: string) => { state.invalidations.push(id); } }));
vi.mock("@/pipeline/before/workspacePolicy", () => ({ bumpWorkspacePolicyVersion: async () => { state.policyBumps += 1; return 1; } }));
vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: async () => ({ ok: true, value: { workspaceId: "workspace_1", userId: "user_1", requestId: "request_1" } }) }));
vi.mock("./route-helpers", () => ({
	requireCapability: () => null,
	requireOAuthWorkspaceRole: async () => null,
	rejectThirdPartyOAuthSpendingChange: () => null,
	requireJsonBody: async (req: Request) => req.json(),
	isResponse: (value: unknown) => value instanceof Response,
	internalServerError: (_name: string, error: unknown) => new Response(JSON.stringify({ error: String(error) }), { status: 500 }),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (request: Request) => Promise<Response>) => (context: any) => handler(context.req.raw),
}));

describe("workspace settings management", () => {
	beforeEach(() => {
		state.patch = null;
		state.rpcCalls.length = 0;
		state.rpcError = null;
		state.policyBumps = 0;
		state.audits.length = 0;
		state.invalidations.length = 0;
		vi.resetModules();
	});

	it("validates and audits routing policy changes", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ routing_mode: "latency", response_healing_enabled: true, response_healing_locked: true }),
		});
		expect(response.status).toBe(200);
		expect(state.patch).toMatchObject({ workspace_id: "workspace_1", routing_mode: "latency", response_healing_enabled: true, response_healing_locked: true });
		expect(state.invalidations).toContain("key_1");
		expect(state.audits[0]).toMatchObject({ action: "routing.policy.updated" });
	});

	it("saves privacy and provider rules to the workspace baseline guardrail and the rest to workspace_settings", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ privacyZdrOnly: true, provider_restriction_mode: "allowlist", providerRestrictionProviderIds: ["openai", "openai"], routing_mode: "price" }),
		});
		expect(response.status).toBe(200);
		expect(state.rpcCalls).toEqual([{
			name: "save_workspace_baseline_guardrail",
			args: { p_workspace_id: "workspace_1", p_settings: { privacy_zdr_only: true, provider_restriction_mode: "allowlist", provider_restriction_provider_ids: ["openai"] } },
		}]);
		expect(state.patch).toMatchObject({ workspace_id: "workspace_1", routing_mode: "price" });
		expect(state.patch).not.toHaveProperty("privacy_zdr_only");
		expect(state.policyBumps).toBe(1);
		expect((await response.json() as any).data).toMatchObject({ workspace_id: "workspace_1", routing_mode: "latency" });
		expect(state.audits[0]).toMatchObject({ metadata: { changed_fields: ["privacy_zdr_only", "provider_restriction_mode", "provider_restriction_provider_ids", "routing_mode"] } });
	});

	it("saves privacy rules alone without writing workspace_settings directly", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ privacy_enable_paid_may_train: false }),
		});
		expect(response.status).toBe(200);
		expect(state.rpcCalls[0]?.args.p_settings).toEqual({ privacy_enable_paid_may_train: false });
		expect(state.patch).toBeNull();
		expect(state.policyBumps).toBe(1);
	});

	it("reports a failed baseline save and leaves workspace_settings alone", async () => {
		state.rpcError = { message: "workspace_baseline_guardrail_protected" };
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ privacy_zdr_only: true, routing_mode: "price" }),
		});
		expect(response.status).toBe(500);
		expect(state.patch).toBeNull();
		expect(state.audits).toEqual([]);
	});

	it("rejects invalid routing modes before persistence", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ routing_mode: "random" }),
		});
		expect(response.status).toBe(400);
		expect(state.patch).toBeNull();
	});

	it("saves retired model routing settings without touching the gateway context cache", async () => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ modelSuccessorRedirectEnabled: true, model_successor_price_policy: "limit", model_successor_max_price_increase_percent: 25 }),
		});
		expect(response.status).toBe(200);
		expect(state.patch).toMatchObject({ model_successor_redirect_enabled: true, model_successor_price_policy: "limit", model_successor_max_price_increase_percent: 25 });
		expect(state.invalidations).toEqual([]);
	});

	it.each([
		{ model_successor_price_policy: "cheapest" },
		{ model_successor_price_policy: ["never"] },
		{ model_successor_max_price_increase_percent: 1001 },
		{ model_successor_max_price_increase_percent: 2.5 },
		{ model_successor_max_price_increase_percent: "25" },
		{ model_successor_redirect_enabled: "yes" },
	])("rejects invalid retired model routing settings: %o", async (body) => {
		const { settingsRoutes } = await import("./settings");
		const response = await settingsRoutes.request("https://example.com/", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		expect(response.status).toBe(400);
		expect(state.patch).toBeNull();
	});
});
