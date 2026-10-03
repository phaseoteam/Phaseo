import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => ({
	viewer: "33333333-3333-4333-8333-333333333333", workspace: "11111111-1111-4111-8111-111111111111", target: "22222222-2222-4222-8222-222222222222",
	signedIn: true, allowedWorkspace: true, role: "admin", targetMember: true, keyCount: 1, pageRows: 1, usageError: false, logsError: false,
	queries: [] as Array<{ table: string; columns?: string; filters: Array<[string, unknown]>; range?: number[]; limit?: number }>,
	rpc: vi.fn(), profile: vi.fn(),
}));

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => mocks.signedIn ? { id: mocks.viewer } : null }));
vi.mock("./workspaceUserProfile", () => ({ workspaceUserProfile: mocks.profile }));
vi.mock("./settings-usage", () => ({ metadataForIds: async (_context: unknown, args: { models: string[] }) => ({ modelMetadataEntries: args.models.map((id) => [id, { modelName: "GPT-5", organisationId: "openai", organisationName: "OpenAI" }]) }) }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => mocks.allowedWorkspace ? {
	user: { id: mocks.viewer }, workspaceId: mocks.workspace, workspaceName: "Example", role: mocks.role,
	client: { rpc: mocks.rpc, from: (table: string) => {
		const query: typeof mocks.queries[number] = { table, filters: [] }; mocks.queries.push(query);
		const result = () => ({ error: table.includes("requests") && mocks.logsError ? { message: "unavailable" } : null,
			count: table === "keys" ? mocks.keyCount : null,
			data: table === "workspace_members" ? (mocks.targetMember ? { role: "member", joined_at: "2026-09-01" } : null)
				: table === "workspaces" ? { owner_user_id: mocks.viewer }
					: table === "keys" ? Array.from({ length: mocks.pageRows }, (_, index) => ({ id: `key-${index}`, workspace_id: mocks.workspace, name: "Production", prefix: "abcdef", status: "active" }))
						: [{ request_id: "request-1", created_at: "2026-10-03T08:00:00Z", model_id: "model-1", success: true, cost_nanos: 250000000 }],
		});
		const builder = {
			select: (columns: string) => { query.columns = columns; return builder; },
			eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder; },
			neq: () => builder, gte: () => builder, lt: () => builder, order: () => builder,
			range: (...bounds: number[]) => { query.range = bounds; return builder; },
			limit: (limit: number) => { query.limit = limit; return builder; },
			maybeSingle: async () => result(),
			then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
		};
		return builder;
	} },
} : null }));
import { accountSettingsWorkspaceUsersRouter } from "./settings-workspace-users";
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsWorkspaceUsersRouter);
const load = (query = "") => app.request(`https://example.com/workspace-users/${mocks.target}?workspaceId=${mocks.workspace}${query}`, {}, {} as Env);

beforeEach(() => {
	vi.clearAllMocks(); mocks.queries.length = 0; mocks.signedIn = true; mocks.allowedWorkspace = true; mocks.role = "admin"; mocks.targetMember = true; mocks.keyCount = 1; mocks.pageRows = 1; mocks.usageError = false; mocks.logsError = false;
	mocks.profile.mockResolvedValue({ id: mocks.target, name: "Alice", avatarUrl: null });
	mocks.rpc.mockResolvedValue({ data: { requests: 12, spendUsd: .25, points: [], models: [{ modelId: "model-1", requests: 12, spendUsd: .25 }] }, error: null });
});

describe("workspace user profiles", () => {
	it.each(["admin", "owner"])("allows %s and scopes all private reads", async (role) => {
		mocks.role = role;
		const response = await load(); expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ profile: { name: "Alice" }, analytics: { requests: 12 }, keyCount: 1, modelMetadataEntries: [["model-1", { modelName: "GPT-5", organisationId: "openai" }]] });
		expect(response.headers.get("cache-control")).toContain("no-store");
		const keys = mocks.queries.find((query) => query.table === "keys")!;
		expect(keys.filters).toContainEqual(["workspace_id", mocks.workspace]); expect(keys.filters).toContainEqual(["created_by", mocks.target]);
		expect(keys.columns).not.toMatch(/hash|secret|kid/);
		const logs = mocks.queries.find((query) => query.table.includes("requests"))!;
		expect(logs.filters).toContainEqual(["workspace_id", mocks.workspace]); expect(logs.filters).toContainEqual(["key_created_by", mocks.target]); expect(logs.limit).toBe(50);
		expect(mocks.rpc).toHaveBeenCalledWith("get_workspace_user_usage", expect.objectContaining({ p_workspace_id: mocks.workspace, p_user_id: mocks.target }));
		const params = mocks.rpc.mock.calls[0][1]; expect(Date.parse(params.p_to) - Date.parse(params.p_from)).toBeLessThanOrEqual(30 * 86400000);
	});
	it.each(["member", "viewer"])("denies %s before reading private data", async (role) => { mocks.role = role; expect((await load()).status).toBe(403); expect(mocks.queries).toHaveLength(0); expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); });
	it("denies cross-workspace access", async () => { mocks.allowedWorkspace = false; expect((await load()).status).toBe(403); expect(mocks.queries).toHaveLength(0); });
	it("requires sign-in", async () => { mocks.signedIn = false; expect((await load()).status).toBe(401); expect(mocks.queries).toHaveLength(0); });
	it("does not resolve an unrelated user profile", async () => { mocks.targetMember = false; mocks.keyCount = 0; mocks.pageRows = 0; expect((await load()).status).toBe(404); expect(mocks.profile).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled(); });
	it("allows historical key creators after leaving the workspace", async () => { mocks.targetMember = false; expect((await load()).status).toBe(200); });
	it("paginates keys without broadening their creator scope", async () => { mocks.pageRows = 51; mocks.keyCount = 120; const payload = await (await load("&keyPage=2")).json() as any; expect(payload.keys).toHaveLength(50); expect(payload.hasMoreKeys).toBe(true); expect(mocks.queries.find((query) => query.table === "keys")?.range).toEqual([50, 100]); });
	it("keeps failed analytics distinct from zero", async () => { mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } }); expect(await (await load()).json()).toMatchObject({ analytics: null, profile: { name: "Alice" } }); });
	it("keeps failed logs distinct from an empty list", async () => { mocks.logsError = true; expect(await (await load()).json()).toMatchObject({ logs: null }); });
});
