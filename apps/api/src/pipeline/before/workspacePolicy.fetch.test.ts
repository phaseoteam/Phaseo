import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: unknown };

const runtime = vi.hoisted(() => {
	const store = new Map<string, string>();
	const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
	const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
	const tables: Record<string, Result> = {};
	// result: the three-argument resolve_key_guardrails (from the workspace baseline migration on);
	// legacyResult: the two-argument form (guardrail levels, before the baseline).
	const rpc = { result: { data: [], error: null } as Result, legacyResult: { data: [], error: null } as Result };

	function builder(table: string) {
		const entry = { table, filters: [] as Array<[string, unknown]> };
		queries.push(entry);
		// Like PostgREST, an `in` filter on id only returns the listed rows.
		const result = () => {
			const base = tables[table] ?? { data: null, error: null };
			const ids = entry.filters.find(([column]) => column === "id")?.[1];
			if (!Array.isArray(ids) || !Array.isArray(base.data)) return Promise.resolve(base);
			return Promise.resolve({ ...base, data: base.data.filter((row: any) => ids.includes(row.id)) });
		};
		const chain: any = {
			select: () => chain,
			eq: (column: string, value: unknown) => {
				entry.filters.push([column, value]);
				return chain;
			},
			in: (column: string, value: unknown) => {
				entry.filters.push([column, value]);
				return chain;
			},
			maybeSingle: result,
			then: (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
		};
		return chain;
	}

	const supabase = {
		from: vi.fn((table: string) => builder(table)),
		// Pages with .range like PostgREST, which returns at most 1,000 rows per response.
		rpc: vi.fn((name: string, args: Record<string, unknown>) => {
			const chain: any = {
				order: () => chain,
				range: (from: number, to: number) => {
					rpcCalls.push({ name, args });
					const { data, error } = "p_include_workspace_baseline" in args ? rpc.result : rpc.legacyResult;
					return Promise.resolve({ data: Array.isArray(data) ? data.slice(from, Math.min(to + 1, from + 1000)) : data, error });
				},
			};
			return chain;
		}),
	};
	const cache = {
		get: vi.fn(async (key: string) => store.get(key) ?? null),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
	};
	return { store, queries, rpcCalls, tables, rpc, supabase, cache };
});

vi.mock("@/runtime/env", () => ({
	getSupabaseAdmin: () => runtime.supabase,
	getCache: () => runtime.cache,
	dispatchBackground: () => undefined,
}));
vi.mock("@/core/kv", () => ({ keyVersionToken: async () => "v0" }));
vi.mock("@core/shared-version-cache", () => ({
	SHARED_VERSION_TTL_MS: 30_000,
	readSharedVersion: async (key: string) => ({ value: Number(runtime.store.get(key) ?? 0), expiresAt: Date.now() + 30_000 }),
	rememberSharedVersion: () => undefined,
}));
vi.mock("@core/tiered-cache", () => ({
	readLocationCache: async () => null,
	writeLocationCache: async () => undefined,
}));

import { bumpWorkspacePolicyVersion, fetchWorkspacePolicy } from "./workspacePolicy";

const guardrail = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

let workspaceSeq = 0;
function freshWorkspace(): string {
	workspaceSeq += 1;
	return `ws_${workspaceSeq}`;
}

beforeEach(() => {
	runtime.store.clear();
	runtime.queries.length = 0;
	runtime.rpcCalls.length = 0;
	for (const key of Object.keys(runtime.tables)) delete runtime.tables[key];
	runtime.tables.workspace_settings = { data: null, error: null };
	runtime.tables.keys = { data: { created_by: "user_creator", oauth_user_id: null, never_store_content: false }, error: null };
	runtime.tables.gateway_dynamic_route_keys = { data: null, error: null };
	runtime.rpc.result = { data: [], error: null };
	runtime.rpc.legacyResult = { data: [], error: null };
});

const missingFunction = (args: string) => ({
	data: null,
	error: { code: "PGRST202", message: `Could not find the function public.resolve_key_guardrails(${args}) in the schema cache` },
});
const withBaselineArgs = (workspaceId: string) => ({ p_workspace_id: workspaceId, p_key_id: "key_1", p_include_workspace_baseline: true });

describe("fetchWorkspacePolicy guardrail resolution", () => {
	it("reads the guardrails that apply to the key from resolve_key_guardrails", async () => {
		const workspaceId = freshWorkspace();
		runtime.rpc.result = {
			data: [
				{ guardrail_id: "g_workspace", source_type: "workspace", source_id: null },
				{ guardrail_id: "g_department", source_type: "department", source_id: "dep_1" },
				{ guardrail_id: "g_department", source_type: "member", source_id: "user_creator" },
				{ guardrail_id: "g_key", source_type: "key", source_id: "key_1" },
			],
			error: null,
		};
		runtime.tables.workspace_guardrails = {
			data: [
				guardrail("g_workspace", { privacy_zdr_only: true }),
				guardrail("g_department", { provider_restriction_mode: "blocklist", provider_restriction_provider_ids: ["openai"] }),
				guardrail("g_key", { prompt_injection_enabled: true, prompt_injection_action: "block" }),
			],
			error: null,
		};

		const policy = await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });

		expect(runtime.rpcCalls).toEqual([{ name: "resolve_key_guardrails", args: withBaselineArgs(workspaceId) }]);
		const guardrailQuery = runtime.queries.find((query) => query.table === "workspace_guardrails");
		expect(guardrailQuery?.filters).toContainEqual(["id", ["g_workspace", "g_department", "g_key"]]);
		expect(guardrailQuery?.filters).toContainEqual(["enabled", true]);
		expect(runtime.queries.map((query) => query.table)).not.toContain("key_guardrails");
		expect(runtime.queries.map((query) => query.table)).not.toContain("workspace_member_guardrails");
		expect(policy.activeGuardrailIds).toEqual(["g_workspace", "g_department", "g_key"]);
		expect(policy.privacyZdrOnly).toBe(true);
		expect(policy.providerBlocklist).toEqual(["openai"]);
		expect(policy.promptInjectionAction).toBe("block");
	});

	it("reads every page of resolved rows and every guardrail, past 1,000 rows", async () => {
		const workspaceId = freshWorkspace();
		// 600 guardrails on both the key and its member: 1,200 rows, more than one response holds.
		const ids = Array.from({ length: 600 }, (_, index) => `g_${String(index).padStart(3, "0")}`);
		runtime.rpc.result = {
			data: ids.flatMap((id) => [
				{ guardrail_id: id, source_type: "key", source_id: "key_1" },
				{ guardrail_id: id, source_type: "member", source_id: "user_creator" },
			]),
			error: null,
		};
		runtime.tables.workspace_guardrails = { data: ids.map((id) => guardrail(id)), error: null };

		const policy = await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });

		expect(runtime.rpcCalls).toHaveLength(2);
		expect(policy.activeGuardrailIds).toHaveLength(600);
		expect(policy.activeGuardrailIds.at(-1)).toBe("g_599");
		expect(runtime.queries.filter((query) => query.table === "workspace_guardrails")).toHaveLength(3);
	});

	it("skips the guardrail lookup when nothing applies", async () => {
		const policy = await fetchWorkspacePolicy({ workspaceId: freshWorkspace(), apiKeyId: "key_1" });
		expect(runtime.queries.map((query) => query.table)).not.toContain("workspace_guardrails");
		expect(policy.activeGuardrailIds).toEqual([]);
	});

	it("re-reads after a workspace publication bumps the version (department and workspace changes)", async () => {
		const workspaceId = freshWorkspace();
		runtime.rpc.result = { data: [{ guardrail_id: "g_department", source_type: "department", source_id: "dep_1" }], error: null };
		runtime.tables.workspace_guardrails = { data: [guardrail("g_department")], error: null };
		expect((await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" })).activeGuardrailIds).toEqual(["g_department"]);
		expect(runtime.rpcCalls).toHaveLength(1);

		runtime.rpc.result = { data: [], error: null };
		expect((await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" })).activeGuardrailIds).toEqual(["g_department"]);
		expect(runtime.rpcCalls).toHaveLength(1);

		await bumpWorkspacePolicyVersion(workspaceId);
		expect((await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" })).activeGuardrailIds).toEqual([]);
		expect(runtime.rpcCalls).toHaveLength(2);
	});

	it("gives two bumps that read the same stale counter different versions", async () => {
		const workspaceId = freshWorkspace();
		const key = `gateway:workspace-policy-version:${workspaceId}`;
		runtime.store.set(key, "4");
		// Both locations read 4 (KV reads can lag by up to a minute), so read + 1 would collide.
		runtime.cache.get.mockImplementation(async (name: string) => (name === key ? "4" : runtime.store.get(name) ?? null));
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(1_800_000_000_000);
			const first = await bumpWorkspacePolicyVersion(workspaceId);
			vi.setSystemTime(1_800_000_000_002);
			const second = await bumpWorkspacePolicyVersion(workspaceId);
			expect(first).toBe(1_800_000_000_000);
			expect(second).toBe(1_800_000_000_002);
		} finally {
			vi.useRealTimers();
			runtime.cache.get.mockImplementation(async (name: string) => runtime.store.get(name) ?? null);
		}
	});

	it("reads the source of truth and caches nothing when a version counter cannot be read", async () => {
		const workspaceId = freshWorkspace();
		runtime.rpc.result = { data: [{ guardrail_id: "g_workspace", source_type: "workspace", source_id: null }], error: null };
		runtime.tables.workspace_guardrails = { data: [guardrail("g_workspace")], error: null };
		const kv = await import("@/core/kv");
		const spy = vi.spyOn(kv, "keyVersionToken").mockResolvedValue(null);
		try {
			await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });
			await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });
		} finally {
			spy.mockRestore();
		}
		expect(runtime.rpcCalls).toHaveLength(2);
		expect(runtime.cache.put).not.toHaveBeenCalledWith(expect.stringContaining(workspaceId), expect.any(String), expect.any(Object));
	});

	it("takes the workspace-wide rules from the workspace baseline guardrail, not workspace_settings", async () => {
		const workspaceId = freshWorkspace();
		// workspace_settings mirrors the baseline; it must not be read (or applied a second time).
		runtime.tables.workspace_settings = { data: { privacy_zdr_only: false, model_restriction_mode: "allowlist", model_restriction_model_ids: ["stale"] }, error: null };
		runtime.rpc.result = { data: [{ guardrail_id: "g_baseline", source_type: "workspace", source_id: null }], error: null };
		runtime.tables.workspace_guardrails = {
			data: [guardrail("g_baseline", {
				privacy_enable_paid_may_train: false,
				privacy_zdr_only: true,
				provider_restriction_mode: "allowlist",
				provider_restriction_provider_ids: ["anthropic"],
				model_restriction_mode: "blocklist",
				allowed_api_model_ids: ["gpt-x"],
			})],
			error: null,
		};

		const policy = await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });

		expect(runtime.queries.map((query) => query.table)).not.toContain("workspace_settings");
		expect(runtime.rpcCalls).toHaveLength(1);
		expect(policy).toMatchObject({
			activeGuardrailIds: ["g_baseline"],
			privacyEnablePaidMayTrain: false,
			privacyZdrOnly: true,
			providerAllowlist: ["anthropic"],
			allowedApiModels: null,
			blockedApiModels: ["gpt-x"],
		});
	});

	it("reads the workspace rules from workspace_settings until the baseline migration has run", async () => {
		const workspaceId = freshWorkspace();
		runtime.rpc.result = missingFunction("p_include_workspace_baseline, p_key_id, p_workspace_id");
		runtime.rpc.legacyResult = { data: [{ guardrail_id: "g_key", source_type: "key", source_id: "key_1" }], error: null };
		runtime.tables.workspace_settings = {
			data: { privacy_zdr_only: true, model_restriction_mode: "allowlist", model_restriction_model_ids: ["m-1"] },
			error: null,
		};
		runtime.tables.workspace_guardrails = { data: [guardrail("g_key", { privacy_enable_free_may_train: false })], error: null };

		const policy = await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });

		expect(runtime.rpcCalls.map((call) => call.args)).toEqual([
			withBaselineArgs(workspaceId),
			{ p_workspace_id: workspaceId, p_key_id: "key_1" },
		]);
		expect(runtime.queries.find((query) => query.table === "workspace_settings")?.filters).toEqual([["workspace_id", workspaceId]]);
		expect(policy).toMatchObject({
			activeGuardrailIds: ["g_key"],
			privacyZdrOnly: true,
			privacyEnableFreeMayTrain: false,
			allowedApiModels: ["m-1"],
		});
	});

	it("fails closed when workspace_settings cannot be read before the baseline migration", async () => {
		runtime.rpc.result = missingFunction("p_include_workspace_baseline, p_key_id, p_workspace_id");
		runtime.tables.workspace_settings = { data: null, error: { message: "connection reset" } };
		await expect(fetchWorkspacePolicy({ workspaceId: freshWorkspace(), apiKeyId: "key_1" }))
			.rejects.toThrow("workspace_settings_lookup_failed:connection reset");
	});

	it("falls back to the key and principal member join tables until the function is deployed", async () => {
		runtime.rpc.result = missingFunction("p_include_workspace_baseline, p_key_id, p_workspace_id");
		runtime.rpc.legacyResult = missingFunction("p_key_id, p_workspace_id");
		runtime.tables.keys = { data: { created_by: "user_creator", oauth_user_id: "user_oauth", never_store_content: false }, error: null };
		runtime.tables.key_guardrails = { data: [{ guardrail_id: "g_key" }], error: null };
		runtime.tables.workspace_member_guardrails = { data: [{ guardrail_id: "g_member" }, { guardrail_id: "g_key" }], error: null };
		runtime.tables.workspace_guardrails = { data: [guardrail("g_key"), guardrail("g_member")], error: null };
		const workspaceId = freshWorkspace();

		const policy = await fetchWorkspacePolicy({ workspaceId, apiKeyId: "key_1" });

		expect(runtime.queries.find((query) => query.table === "key_guardrails")?.filters).toEqual([["key_id", "key_1"]]);
		expect(runtime.queries.find((query) => query.table === "workspace_member_guardrails")?.filters)
			.toEqual([["workspace_id", workspaceId], ["user_id", "user_oauth"]]);
		expect(runtime.queries.find((query) => query.table === "workspace_guardrails")?.filters).toContainEqual(["id", ["g_key", "g_member"]]);
		expect(policy.activeGuardrailIds).toEqual(["g_key", "g_member"]);
		expect(runtime.queries.map((query) => query.table)).toContain("workspace_settings");
	});

	it("fails closed on any other resolution error", async () => {
		runtime.rpc.result = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
		await expect(fetchWorkspacePolicy({ workspaceId: freshWorkspace(), apiKeyId: "key_1" }))
			.rejects.toThrow("key_guardrails_lookup_failed:canceling statement due to statement timeout");
		expect(runtime.rpcCalls).toHaveLength(1);
		expect(runtime.queries.map((query) => query.table)).not.toContain("workspace_settings");
	});

	it("fails closed when the key lookup fails", async () => {
		runtime.tables.keys = { data: null, error: { message: "timeout" } };
		await expect(fetchWorkspacePolicy({ workspaceId: freshWorkspace(), apiKeyId: "key_1" }))
			.rejects.toThrow("key_principal_lookup_failed:timeout");
	});
});
