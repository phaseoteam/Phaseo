import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, any>;

const mocks = vi.hoisted(() => ({
	session: null as unknown,
	gate: true,
	policies: [] as Row[],
	keys: [] as Row[],
	audits: [] as Array<Record<string, unknown>>,
	rpcCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("./dashboard-session", () => ({ authenticateDashboardSession: async () => mocks.session }));
vi.mock("@core/feature-flags", () => ({ isWorkloadIdentityAccessEnabled: async () => mocks.gate }));
vi.mock("@/lib/audit/workspaceAudit", () => ({
	recordWorkspaceAuditEvent: async (_client: unknown, event: Record<string, unknown>) => void mocks.audits.push(event),
}));
vi.mock("@/routes/utils", () => ({
	json: (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }),
	withRuntime: (handler: (req: Request) => Promise<Response>) => async (c: any) => handler(c.req.raw),
}));
vi.mock("@/runtime/env", () => {
	// A small in-memory stand-in for the PostgREST builder calls the routes make.
	function table(name: string): Row[] {
		return name === "keys" ? mocks.keys : mocks.policies;
	}
	function withKey(row: Row): Row {
		const key = mocks.keys.find((candidate) => candidate.id === row.key_id);
		return { ...row, keys: key ? { kid: key.kid, status: key.status, last_used_at: key.last_used_at ?? null } : null };
	}
	function builder(name: string) {
		const filters: Array<[string, unknown]> = [];
		let op: "select" | "update" | "delete" | "count" = "select";
		let payload: Row = {};
		const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);
		const run = () => {
			const rows = table(name);
			if (op === "update") {
				for (const row of rows.filter(matches)) Object.assign(row, payload);
				return { data: null, error: null };
			}
			if (op === "delete") {
				const keep = rows.filter((row) => !matches(row));
				rows.splice(0, rows.length, ...keep);
				return { data: null, error: null };
			}
			if (op === "count") return { count: rows.filter(matches).length, error: null };
			return { data: rows.filter(matches).map(withKey), error: null };
		};
		const chain: any = {
			select: (_columns: string, options?: { count?: string }) => {
				if (options?.count) op = "count";
				return chain;
			},
			update: (value: Row) => { op = "update"; payload = value; return chain; },
			delete: () => { op = "delete"; return chain; },
			eq: (column: string, value: unknown) => { filters.push([column, value]); return chain; },
			order: () => chain,
			limit: () => chain,
			maybeSingle: async () => {
				const result = run() as { data: Row[] };
				return { data: result.data[0] ?? null, error: null };
			},
			then: (resolve: (value: unknown) => unknown) => resolve(run()),
		};
		return chain;
	}
	return {
		getSupabaseAdmin: () => ({
			from: builder,
			rpc: async (name: string, args: Row) => {
				if (name !== "create_workload_identity_policy") throw new Error(name);
				mocks.rpcCalls.push(args);
				// The SQL function enforces the cap.
				if (mocks.policies.filter((row) => row.workspace_id === args.p_workspace_id).length >= 50) {
					return { data: null, error: { message: "workload_identity_policy_limit" } };
				}
				const keyId = `key-${mocks.keys.length + 1}`;
				const policyId = `00000000-0000-4000-8000-00000000010${mocks.policies.length + 1}`;
				mocks.keys.push({ id: keyId, workspace_id: args.p_workspace_id, kid: `kid${keyId}`, status: "active", key_kind: "workload_identity" });
				mocks.policies.push({
					id: policyId, workspace_id: args.p_workspace_id, key_id: keyId, name: args.p_name, provider: args.p_provider,
					issuer: args.p_issuer, pinned_owner_id: args.p_pinned_owner_id, claim_conditions: args.p_claim_conditions,
					max_token_lifetime_seconds: args.p_max_token_lifetime_seconds, status: "active", created_by: args.p_created_by,
					created_at: "2026-10-26T00:00:00Z", updated_at: "2026-10-26T00:00:00Z",
				});
				return { data: [{ policy_id: policyId, key_id: keyId }], error: null };
			},
		}),
	};
});

import { workloadIdentityRoutes } from "./workload-identity";

const WS = "00000000-0000-4000-8000-000000000001";
const session = (role: string) => ({ role, auth: { workspaceId: WS, userId: "user-1" } });

function call(method: string, path: string, body?: unknown) {
	return workloadIdentityRoutes.request(`https://api.phaseo.test${path}`, {
		method,
		headers: { "content-type": "application/json" },
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

const vercelPolicy = {
	name: "Website production",
	provider: "vercel",
	issuer: "https://oidc.vercel.com/acme",
	owner_id: "team_123",
	claim_conditions: { project_id: ["prj_web"], environment: ["production"] },
};

beforeEach(() => {
	mocks.session = session("owner");
	mocks.gate = true;
	mocks.policies.length = 0;
	mocks.keys.length = 0;
	mocks.audits.length = 0;
	mocks.rpcCalls.length = 0;
});

describe("workload identity policy routes", () => {
	it("creates a policy with the owner in its own column and audits it", async () => {
		const response = await call("POST", "/policies", vercelPolicy);
		expect(response.status).toBe(201);
		const { data } = await response.json() as { data: Row };
		expect(data).toMatchObject({
			name: "Website production",
			provider: "vercel",
			issuer: "https://oidc.vercel.com/acme",
			owner_id: "team_123",
			claim_conditions: { project_id: ["prj_web"], environment: ["production"] },
			max_token_lifetime_seconds: 43_200,
			status: "active",
			audience: "https://api.phaseo.app",
		});
		expect(mocks.rpcCalls[0]).toMatchObject({
			p_workspace_id: WS,
			p_created_by: "user-1",
			p_pinned_owner_id: "team_123",
			p_claim_conditions: { project_id: ["prj_web"], environment: ["production"] },
		});
		expect(mocks.audits).toEqual([expect.objectContaining({ action: "workload_identity_policy.created", targetName: "Website production" })]);
	});

	it("defaults GitHub Actions to its global issuer", async () => {
		const response = await call("POST", "/policies", { name: "CI", provider: "github_actions", owner_id: "42", claim_conditions: { repository_id: ["7"] } });
		expect(response.status).toBe(201);
		expect(mocks.rpcCalls[0]).toMatchObject({ p_issuer: "https://token.actions.githubusercontent.com", p_pinned_owner_id: "42" });
	});

	it("rejects invalid policies before writing anything", async () => {
		const cases: Array<[Record<string, unknown>, string]> = [
			[{ ...vercelPolicy, owner_id: "" }, 'claim "owner_id" is required for vercel policies'],
			[{ ...vercelPolicy, issuer: "https://token.actions.githubusercontent.com" }, "issuer is not a vercel issuer"],
			[{ ...vercelPolicy, provider: "custom" }, "provider must be vercel or github_actions"],
			[{ ...vercelPolicy, claim_conditions: { owner_id: ["team_other"] } }, "set owner_id with owner_id, not in claim_conditions"],
			[{ ...vercelPolicy, claim_conditions: { aud: ["x"] } }, 'claim "aud" cannot be a condition'],
			[{ ...vercelPolicy, max_token_lifetime_seconds: 10 }, "maxTokenLifetimeSeconds must be an integer from 60 to 43200"],
			[{ ...vercelPolicy, name: "" }, "name must be 1 to 100 characters"],
		];
		for (const [body, message] of cases) {
			const response = await call("POST", "/policies", body);
			expect(response.status).toBe(400);
			const result = await response.json() as { message: string; errors?: string[] };
			expect([result.message, ...(result.errors ?? [])]).toContain(message);
		}
		expect(mocks.rpcCalls).toHaveLength(0);
	});

	it("caps policies per workspace", async () => {
		for (let i = 0; i < 50; i += 1) mocks.policies.push({ id: `p${i}`, workspace_id: WS });
		const response = await call("POST", "/policies", vercelPolicy);
		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: "limit_reached" });
		expect(mocks.keys).toHaveLength(0);
	});

	it("lists, reads and updates only the workspace's policies", async () => {
		await call("POST", "/policies", vercelPolicy);
		mocks.policies.push({ id: "00000000-0000-4000-8000-000000000999", workspace_id: "other-ws", key_id: "x", name: "Other" });
		const id = mocks.policies[0].id;

		const list = await (await call("GET", "/policies")).json() as { data: Row[]; audience: string };
		expect(list.data.map((policy) => policy.name)).toEqual(["Website production"]);
		expect(list.audience).toBe("https://api.phaseo.app");
		expect((await call("GET", "/policies/00000000-0000-4000-8000-000000000999")).status).toBe(404);

		const updated = await call("PATCH", `/policies/${id}`, { status: "disabled", claim_conditions: { environment: ["preview"] } });
		expect(updated.status).toBe(200);
		expect(mocks.policies[0]).toMatchObject({ status: "disabled", claim_conditions: { environment: ["preview"] } });
		expect(mocks.audits.at(-1)).toMatchObject({ action: "workload_identity_policy.updated" });
		expect((await call("PATCH", `/policies/${id}`, { owner_id: "team_other" })).status).toBe(400);
		expect((await call("PATCH", `/policies/${id}`, { status: "paused" })).status).toBe(400);
	});

	it("deletes a policy and revokes its key", async () => {
		await call("POST", "/policies", vercelPolicy);
		const id = mocks.policies[0].id;
		const response = await call("DELETE", `/policies/${id}`);
		expect(response.status).toBe(200);
		expect(mocks.policies).toHaveLength(0);
		expect(mocks.keys[0]).toMatchObject({ status: "revoked", revoked_reason: "workload_identity_policy_deleted" });
		expect(mocks.audits.at(-1)).toMatchObject({ action: "workload_identity_policy.deleted" });
	});

	it("is only for owners and admins of workspaces in the rollout, from the dashboard", async () => {
		mocks.session = session("member");
		expect((await call("GET", "/policies")).status).toBe(403);
		mocks.session = null;
		expect((await call("GET", "/policies")).status).toBe(403);
		mocks.session = session("admin");
		mocks.gate = false;
		expect((await call("GET", "/policies")).status).toBe(404);
		expect((await call("POST", "/policies", vercelPolicy)).status).toBe(404);
		expect(mocks.rpcCalls).toHaveLength(0);
	});
});
