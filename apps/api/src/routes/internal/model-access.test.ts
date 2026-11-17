import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const TOKEN = "model-access-test-token-at-least-32-bytes";

type TableRows = { workspace_members: unknown; workspaces: unknown; keys: unknown };
let tables: TableRows;
const queries: Array<{ table: string; filters: Array<[string, unknown]> }> = [];

/** A PostgREST-ish builder: every filter chains, and the query resolves to the table's canned result. */
function builder(table: keyof TableRows) {
	const record = { table, filters: [] as Array<[string, unknown]>, order: [] as unknown[] };
	queries.push(record);
	const result = () => ({ data: tables[table], error: null });
	const chain: any = {
		select: () => chain,
		eq: (column: string, value: unknown) => { record.filters.push([column, value]); return chain; },
		order: (...args: unknown[]) => { record.order.push(args); return chain; },
		limit: () => chain,
		maybeSingle: async () => result(),
		then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
	};
	return chain;
}

const fetchWorkspacePolicyMock = vi.fn();
const fetchMemberWorkspacePolicyMock = vi.fn();
const loadModelListingMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	configureRuntime: vi.fn(),
	clearRuntime: vi.fn(),
	getBindingsIfConfigured: () => ({}),
	getSupabaseAdmin: () => ({ from: (table: keyof TableRows) => builder(table) }),
}));
vi.mock("@pipeline/before/deployment-region", () => ({ normalizeGatewayRoutingRegion: () => null }));
vi.mock("@pipeline/before/workspacePolicy", () => ({
	fetchWorkspacePolicy: (...args: unknown[]) => fetchWorkspacePolicyMock(...args),
	fetchMemberWorkspacePolicy: (...args: unknown[]) => fetchMemberWorkspacePolicyMock(...args),
}));
vi.mock("@/routes/v1/control/models", () => ({
	loadModelListing: (...args: unknown[]) => loadModelListingMock(...args),
	wholeCatalogueQuery: () => ({ whole: true }),
}));
vi.mock("@/routes/v1/control/models.policy", () => ({
	policyRestrictsModels: (policy: { restricted?: boolean }) => policy.restricted === true,
}));
vi.mock("@/routes/v1/control/management-helpers", () => ({ CHAT_MANAGED_KEY_NAME: "__chat_route_managed_key__" }));
vi.mock("./notification-tests", () => ({
	authorized: (c: { env: { GATEWAY_INTERNAL_TEST_TOKEN?: string }; req: { header: (name: string) => string | undefined } }) =>
		c.req.header("authorization") === `Bearer ${c.env.GATEWAY_INTERNAL_TEST_TOKEN}`,
}));

import { internalModelAccessRoutes } from "./model-access";

const env = { GATEWAY_INTERNAL_TEST_TOKEN: TOKEN } as never;
const get = (query: string, token = TOKEN) =>
	internalModelAccessRoutes.request(`/?${query}`, { headers: { authorization: `Bearer ${token}` } }, env);
const model = (id: string, providers: string[]) => ({ id, name: `${id} name`, offers: providers.map((provider) => ({ provider: { id: provider } })) });

describe("GET /internal/model-access", () => {
	beforeEach(() => {
		queries.length = 0;
		tables = { workspace_members: { user_id: USER }, workspaces: { owner_user_id: "someone-else" }, keys: [] };
		fetchWorkspacePolicyMock.mockReset().mockResolvedValue({ restricted: true, from: "key" });
		fetchMemberWorkspacePolicyMock.mockReset().mockResolvedValue({ restricted: true, from: "member" });
		loadModelListingMock.mockReset().mockResolvedValue({
			listed: [model("a/one", ["p1", "p2"]), model("b/two", ["p1"]), model("c/three", ["p3"])],
			permitted: [model("a/one", ["p2"]), model("c/three", ["p3"])],
			policy: null,
		});
	});

	it("needs the internal token", async () => {
		const response = await get(`workspace_id=${WORKSPACE}&user_id=${USER}`, "wrong");
		expect(response.status).toBe(401);
		expect(queries).toHaveLength(0);
	});

	it("rejects ids that aren't uuids", async () => {
		expect((await get(`workspace_id=nope&user_id=${USER}`)).status).toBe(400);
		expect((await get(`workspace_id=${WORKSPACE}`)).status).toBe(400);
	});

	it("refuses a user who isn't in the workspace", async () => {
		tables.workspace_members = null;
		const response = await get(`workspace_id=${WORKSPACE}&user_id=${USER}`);
		expect(response.status).toBe(403);
		expect(fetchMemberWorkspacePolicyMock).not.toHaveBeenCalled();
		expect(fetchWorkspacePolicyMock).not.toHaveBeenCalled();
	});

	it("lets the workspace owner in without a membership row", async () => {
		tables.workspace_members = null;
		tables.workspaces = { owner_user_id: USER };
		expect((await get(`workspace_id=${WORKSPACE}&user_id=${USER}`)).status).toBe(200);
	});

	it("uses the member's rules when they have no Chat key yet, and lists what they leave out", async () => {
		const response = await get(`workspace_id=${WORKSPACE}&user_id=${USER}`);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(fetchMemberWorkspacePolicyMock).toHaveBeenCalledWith({ workspaceId: WORKSPACE, userId: USER });
		expect(fetchWorkspacePolicyMock).not.toHaveBeenCalled();
		expect(loadModelListingMock).toHaveBeenCalledWith({ workspaceId: WORKSPACE, apiKeyId: null }, { whole: true }, { restricted: true, from: "member" });
		expect(await response.json()).toEqual({
			ok: true,
			workspace_id: WORKSPACE,
			source: "member",
			restricted: true,
			hidden_model_count: 1,
			limited_model_count: 1,
			hidden_models: [{ id: "b/two", name: "b/two name" }],
			limited_models: { "a/one": ["p2"] },
		});
	});

	it("uses the member's Chat key when it exists, as Chat sends are checked", async () => {
		tables.keys = [{ id: "key-1" }];
		const response = await get(`workspace_id=${WORKSPACE}&user_id=${USER}`);
		expect(response.status).toBe(200);
		expect(fetchWorkspacePolicyMock).toHaveBeenCalledWith({ workspaceId: WORKSPACE, apiKeyId: "key-1" });
		expect(fetchMemberWorkspacePolicyMock).not.toHaveBeenCalled();
		expect(loadModelListingMock).toHaveBeenCalledWith({ workspaceId: WORKSPACE, apiKeyId: "key-1" }, { whole: true }, { restricted: true, from: "key" });
		expect((await response.json()).source).toBe("chat_key");
		const keyQuery = queries.find((query) => query.table === "keys");
		expect(keyQuery?.filters).toEqual(expect.arrayContaining([
			["workspace_id", WORKSPACE], ["created_by", USER], ["name", "__chat_route_managed_key__"], ["status", "active"],
		]));
		// Newest first: after the key seed changes, Chat uses the key made from the new seed.
		expect(keyQuery?.order).toEqual([["created_at", { ascending: false }]]);
	});

	it("skips the catalogue when no rule restricts models", async () => {
		fetchMemberWorkspacePolicyMock.mockResolvedValue({ restricted: false });
		const response = await get(`workspace_id=${WORKSPACE}&user_id=${USER}`);
		expect(await response.json()).toMatchObject({ restricted: false, hidden_model_count: 0, hidden_models: [], limited_models: {} });
		expect(loadModelListingMock).not.toHaveBeenCalled();
	});

	it("says it can't tell, rather than that nothing is hidden, when the rules can't be read", async () => {
		fetchMemberWorkspacePolicyMock.mockRejectedValue(new Error("member_guardrails_lookup_failed:boom"));
		const response = await get(`workspace_id=${WORKSPACE}&user_id=${USER}`);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: "model_access_unavailable" });
	});
});
