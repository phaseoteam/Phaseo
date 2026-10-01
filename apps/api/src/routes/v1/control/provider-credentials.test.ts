import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	auth: null as any,
	rows: [] as any[],
	inserted: null as Record<string, unknown> | null,
	audit: vi.fn(async () => true),
}));

function query(table: string) {
	let mutation: "insert" | "update" | "delete" | null = null;
	const q: any = {
		select: (_columns?: string, options?: { count?: string; head?: boolean }) => {
			if (options?.head) q.head = true;
			return q;
		},
		eq: () => q, neq: () => q, order: () => q, range: () => q, limit: () => q,
		insert: (payload: Record<string, unknown>) => { mutation = "insert"; state.inserted = payload; return q; },
		update: () => { mutation = "update"; return q; },
		delete: () => { mutation = "delete"; return q; },
		maybeSingle: async () => {
			if (mutation === "insert") return { data: { ...state.inserted, id: "00000000-0000-4000-8000-000000000001", created_at: "2026-08-30T13:00:00Z" }, error: null };
			return { data: state.rows[0] ?? null, error: null };
		},
		then: (resolve: (value: unknown) => unknown) => {
			const result = table === "keys"
				? { data: [], error: null }
				: q.head
					? { data: null, count: 0, error: null }
					: mutation === "delete"
						? { data: null, error: null }
						: { data: state.rows, count: state.rows.length, error: null };
			return Promise.resolve(result).then(resolve);
		},
	};
	return q;
}

vi.mock("@/pipeline/before/guards", () => ({ guardManagementAuth: vi.fn(async () => state.auth) }));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ from: (table: string) => query(table), rpc: vi.fn(async () => ({ data: true, error: null })) }) }));
vi.mock("@/core/workspace-publication", () => ({ publishWorkspaceMutation: vi.fn(async () => 1) }));
vi.mock("@/core/provider-credentials", () => ({
	canonicalProviderId: (value: unknown) => String(value ?? "").trim().toLowerCase(),
	normalizeCredentialScope: (value: unknown) => Array.isArray(value) ? value.map(String) : null,
	validateProviderCredential: (_provider: string, value: unknown) => ({ value: String(value), strict: true }),
	encryptProviderCredential: vi.fn(async () => ({
		enc_value: "encrypted", enc_iv: "iv", enc_tag: "tag", key_version: 1,
		fingerprint_sha256: "fingerprint", prefix: "sk-pro", suffix: "cret",
	})),
}));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: state.audit }));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));

describe("provider credential management", () => {
	beforeEach(() => {
		state.auth = { ok: true, value: { workspaceId: "00000000-0000-4000-8000-000000000010", userId: "00000000-0000-4000-8000-000000000020", authMethod: "api_key", scopes: ["provider_credentials:read", "provider_credentials:write", "provider_credentials:delete"], requestId: "req_1" } };
		state.rows = [{ id: "credential_1", workspace_id: state.auth.value.workspaceId, provider_id: "openai", name: "Production", enabled: true, routing_mode: "priority", sort_order: 0, prefix: "sk-pro", suffix: "cret" }];
		state.inserted = null;
		state.audit.mockClear();
		vi.resetModules();
	});

	it("lists only safe credential metadata", async () => {
		const { providerCredentialsRoutes } = await import("./provider-credentials");
		const response = await providerCredentialsRoutes.request("https://example.com/");
		expect(response.status).toBe(200);
		const payload = await response.json() as any;
		expect(payload.data[0]).toMatchObject({ provider_id: "openai", disabled: false, is_fallback: false });
		expect(JSON.stringify(payload)).not.toContain("enc_value");
	});

	it("encrypts a created credential and never returns the plaintext", async () => {
		state.rows = [];
		const { providerCredentialsRoutes } = await import("./provider-credentials");
		const response = await providerCredentialsRoutes.request("https://example.com/", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ provider: "openai", name: "Production", key: "sk-project-secret", routing_mode: "priority" }),
		});
		expect(response.status).toBe(201);
		expect(state.inserted).toMatchObject({ enc_value: "encrypted", provider_id: "openai", routing_mode: "priority" });
		expect(JSON.stringify(await response.json())).not.toContain("sk-project-secret");
		expect(state.audit).toHaveBeenCalled();
	});

	it("requires the provider credential read capability", async () => {
		state.auth.value.scopes = ["settings:read"];
		const { providerCredentialsRoutes } = await import("./provider-credentials");
		const response = await providerCredentialsRoutes.request("https://example.com/");
		expect(response.status).toBe(403);
	});
});
