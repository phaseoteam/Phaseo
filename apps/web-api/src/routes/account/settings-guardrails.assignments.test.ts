import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error: { message: string } | null };
type FakeQuery = PromiseLike<Result> & {
	select(columns: string): FakeQuery;
	delete(): FakeQuery;
	eq(column: string, value: unknown): FakeQuery;
	neq(column: string, value: unknown): FakeQuery;
	in(column: string, values: unknown[]): FakeQuery;
	order(column: string): FakeQuery;
	range(from: number, to: number): FakeQuery;
	insert(rows: Row[]): Promise<Result>;
	maybeSingle(): Promise<{ data: Row | null; error: null }>;
};

const mocks = vi.hoisted(() => ({
	workspace: "ws-1",
	role: "admin",
	signedIn: true,
	db: {} as Record<string, Row[]>,
	writes: [] as Array<{ table: string; op: "delete" | "insert" }>,
	/** Makes the assignment function fail after its removals, as a timeout part-way through would. */
	rpcFailsAfterDelete: false,
	waitUntil: vi.fn(),
	fetch: vi.fn(async () => new Response(null, { status: 204 })),
}));

/**
 * The in-memory apply_guardrail_assignment_change: removals, then additions, all or nothing. Key and
 * member changes go to the legacy tables (the database copies them on); workspace and department
 * changes go to workspace_guardrail_assignments.
 */
function applyChange(args: Record<string, any>): { data: null; error: { message: string } | null } {
	const before = structuredClone(mocks.db);
	const writesBefore = mocks.writes.length;
	const keyTarget = args.p_target_type === "key";
	const levelTarget = args.p_target_type === "workspace" || args.p_target_type === "department";
	if (args.p_target_type === "workspace" && args.p_target_ids.length) return { data: null, error: { message: "invalid_guardrail_assignment_target" } };
	const table = levelTarget ? "workspace_guardrail_assignments" : keyTarget ? "key_guardrails" : "workspace_member_guardrails";
	const targetColumn = levelTarget ? "target_id" : keyTarget ? "key_id" : "user_id";
	const scope: Row = levelTarget
		? { workspace_id: args.p_workspace_id, target_type: args.p_target_type }
		: keyTarget ? {} : { workspace_id: args.p_workspace_id };
	const targetIds: unknown[] = args.p_target_type === "workspace" ? [null] : args.p_target_ids;
	const inScope = (row: Row) => Object.entries(scope).every(([column, value]) => row[column] === value);
	const rows = mocks.db[table] ?? [];
	const removed = rows.filter((row) => inScope(row) && targetIds.includes(row[targetColumn]) && args.p_remove_guardrail_ids.includes(row.guardrail_id));
	if (removed.length) mocks.writes.push({ table, op: "delete" });
	mocks.db[table] = rows.filter((row) => !removed.includes(row));
	if (mocks.rpcFailsAfterDelete) {
		mocks.db = before;
		mocks.writes.length = writesBefore;
		return { data: null, error: { message: "canceling statement due to statement timeout" } };
	}
	for (const targetId of targetIds) {
		for (const guardrailId of args.p_add_guardrail_ids) {
			if ((mocks.db[table] ?? []).some((row) => inScope(row) && row[targetColumn] === targetId && row.guardrail_id === guardrailId)) continue;
			mocks.writes.push({ table, op: "insert" });
			mocks.db[table] = [...(mocks.db[table] ?? []), { ...scope, [targetColumn]: targetId, guardrail_id: guardrailId }];
		}
	}
	return { data: null, error: null };
}

// A small in-memory PostgREST stand-in: filters apply to select and delete, and a response holds 1,000 rows at most.
function fakeClient() {
	return {
		rpc: async (name: string, args: Record<string, any>) => name === "apply_guardrail_assignment_change"
			? applyChange(args)
			: { data: null, error: { message: `unknown function ${name}` } },
		from(table: string) {
			const filters: Array<(row: Row) => boolean> = [];
			let op: "select" | "delete" = "select";
			let range: [number, number] | null = null;
			const run = (): Result => {
				const rows = mocks.db[table] ?? [];
				const all = rows.filter((row) => filters.every((filter) => filter(row)));
				if (op === "delete") {
					mocks.writes.push({ table, op });
					mocks.db[table] = rows.filter((row) => !all.includes(row));
					return { data: all, error: null };
				}
				const [from, to] = range ?? [0, Number.MAX_SAFE_INTEGER];
				return { data: all.slice(from, Math.min(to + 1, from + 1000)), error: null };
			};
			const builder: FakeQuery = {
				select: () => builder,
				delete: () => { op = "delete"; return builder; },
				eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
				neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return builder; },
				in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
				order: () => builder,
				range: (from: number, to: number) => { range = [from, to]; return builder; },
				maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
				insert: async (rows: Row[]) => {
					mocks.writes.push({ table, op: "insert" });
					mocks.db[table] = [...(mocks.db[table] ?? []), ...rows];
					return { data: null, error: null };
				},
				then: (onfulfilled, onrejected) => Promise.resolve(run()).then(onfulfilled, onrejected),
			};
			return builder;
		},
	};
}

vi.mock("./context", () => ({
	requireAccountWorkspace: async ({ workspaceId }: { workspaceId: string }) => mocks.signedIn && workspaceId === mocks.workspace
		? { user: { id: "admin-user" }, workspaceId, role: mocks.role, client: fakeClient() }
		: null,
}));

import { accountSettingsGuardrailsRouter } from "./settings-guardrails";

const env = { GATEWAY_API_ORIGIN: "https://gateway.test", PHASEO_CONTROL_KEY: "control", PHASEO_CONTROL_SECRET: "secret" } as unknown as Env;
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsGuardrailsRouter);
const executionCtx: ExecutionContext = { waitUntil: mocks.waitUntil, passThroughOnException: () => {}, props: {} };
const request = (method: string, path: string, body: Row) => app.request(`https://example.com${path}`, {
	method,
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ workspaceId: mocks.workspace, ...body }),
}, env, executionCtx);
const patch = (body: Row) => request("PATCH", "/guardrails/assignments", body);
const pairs = (table: string, column: string) => (mocks.db[table] ?? []).map((row) => `${row[column]}:${row.guardrail_id}`).sort();
/** The key ids the scheduled cache invalidation posted to the gateway. */
async function invalidated(): Promise<string[]> {
	await Promise.all(mocks.waitUntil.mock.calls.map(([promise]) => promise));
	return mocks.fetch.mock.calls.map(([url]) => decodeURIComponent(String(url).match(/\/v1\/keys\/([^/]+)\/invalidate$/)?.[1] ?? "")).sort();
}

beforeEach(() => {
	mocks.role = "admin";
	mocks.signedIn = true;
	mocks.rpcFailsAfterDelete = false;
	mocks.writes.length = 0;
	mocks.waitUntil.mockReset();
	mocks.fetch.mockClear();
	vi.stubGlobal("fetch", mocks.fetch);
	mocks.db = {
		workspace_guardrails: [{ id: "g-1", workspace_id: "ws-1" }, { id: "g-2", workspace_id: "ws-1" }, { id: "g-foreign", workspace_id: "ws-2" }],
		keys: [
			{ id: "k-1", workspace_id: "ws-1", status: "active", created_by: "u-1", oauth_user_id: null },
			{ id: "k-2", workspace_id: "ws-1", status: "active", created_by: "u-2", oauth_user_id: null },
			{ id: "k-3", workspace_id: "ws-1", status: "active", created_by: "u-2", oauth_user_id: "u-1" },
			{ id: "k-left", workspace_id: "ws-1", status: "active", created_by: "u-left", oauth_user_id: null },
			{ id: "k-deleted", workspace_id: "ws-1", status: "deleted", created_by: "u-1", oauth_user_id: null },
			{ id: "k-foreign", workspace_id: "ws-2", status: "active", created_by: "u-1", oauth_user_id: null },
		],
		workspace_departments: [{ id: "d-1", workspace_id: "ws-1" }, { id: "d-2", workspace_id: "ws-1" }, { id: "d-foreign", workspace_id: "ws-2" }],
		workspace_guardrail_assignments: [{ workspace_id: "ws-1", target_type: "department", target_id: "d-2", guardrail_id: "g-2" }],
		workspace_members: [{ workspace_id: "ws-1", user_id: "u-1" }, { workspace_id: "ws-1", user_id: "u-2" }, { workspace_id: "ws-2", user_id: "u-outsider" }],
		key_guardrails: [
			{ key_id: "k-1", guardrail_id: "g-2" },
			{ key_id: "k-2", guardrail_id: "g-1" },
			{ key_id: "k-3", guardrail_id: "g-2" },
		],
		workspace_member_guardrails: [
			{ workspace_id: "ws-1", user_id: "u-1", guardrail_id: "g-2" },
			{ workspace_id: "ws-1", user_id: "u-2", guardrail_id: "g-2" },
			// u-left has left the workspace; the gateway still applies this to k-left.
			{ workspace_id: "ws-1", user_id: "u-left", guardrail_id: "g-1" },
			{ workspace_id: "ws-2", user_id: "u-1", guardrail_id: "g-2" },
		],
	};
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("PATCH /guardrails/assignments", () => {
	it("adds and removes only the requested key pairs", async () => {
		const response = await patch({ targetType: "key", targetIds: ["k-1", "k-2"], addGuardrailIds: ["g-1"], removeGuardrailIds: ["g-2"] });
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		// k-2 already had g-1, so it is not duplicated; k-3 keeps g-2.
		expect(pairs("key_guardrails", "key_id")).toEqual(["k-1:g-1", "k-2:g-1", "k-3:g-2"]);
		expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
	});

	it("adds and removes only the requested member pairs in this workspace", async () => {
		expect((await patch({ targetType: "member", targetIds: ["u-1"], addGuardrailIds: ["g-1"], removeGuardrailIds: ["g-2"] })).status).toBe(200);
		expect((mocks.db.workspace_member_guardrails ?? []).map((row) => `${row.workspace_id}:${row.user_id}:${row.guardrail_id}`).sort())
			.toEqual(["ws-1:u-1:g-1", "ws-1:u-2:g-2", "ws-1:u-left:g-1", "ws-2:u-1:g-2"]);
	});

	it("leaves every assignment as it was when the change fails part-way", async () => {
		mocks.rpcFailsAfterDelete = true;
		const before = pairs("key_guardrails", "key_id");
		expect((await patch({ targetType: "key", targetIds: ["k-1", "k-3"], addGuardrailIds: ["g-1"], removeGuardrailIds: ["g-2"] })).status).toBe(503);
		expect(pairs("key_guardrails", "key_id")).toEqual(before);
		expect(mocks.waitUntil).not.toHaveBeenCalled();
	});

	it("removes a former member's guardrail, which still reaches the keys they created", async () => {
		expect((await patch({ targetType: "member", targetIds: ["u-left"], removeGuardrailIds: ["g-1"] })).status).toBe(200);
		expect(pairs("workspace_member_guardrails", "user_id")).not.toContain("u-left:g-1");
		expect(await invalidated()).toEqual(["k-left"]);
	});

	it("does not add a guardrail to a former member", async () => {
		expect((await patch({ targetType: "member", targetIds: ["u-left"], addGuardrailIds: ["g-2"] })).status).toBe(409);
		expect(mocks.writes).toEqual([]);
	});

	it("refreshes only the keys a change reaches", async () => {
		expect((await patch({ targetType: "key", targetIds: ["k-2"], addGuardrailIds: ["g-2"] })).status).toBe(200);
		expect(await invalidated()).toEqual(["k-2"]);
	});

	it("refreshes every key whose principal is a changed member", async () => {
		// u-1 created k-1 and is the OAuth user of k-3; k-deleted is skipped.
		expect((await patch({ targetType: "member", targetIds: ["u-1"], addGuardrailIds: ["g-1"] })).status).toBe(200);
		expect(await invalidated()).toEqual(["k-1", "k-3"]);
	});

	it.each([
		["a key from another workspace", ["k-1", "k-foreign"]],
		["a deleted key", ["k-deleted"]],
		["an unknown key", ["k-missing"]],
	])("rejects %s without writing", async (_label, targetIds) => {
		const response = await patch({ targetType: "key", targetIds, addGuardrailIds: ["g-1"] });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "One or more keys do not belong to this workspace" });
		expect(mocks.writes).toEqual([]);
		expect(mocks.waitUntil).not.toHaveBeenCalled();
	});

	it("rejects a user who is not a member of this workspace when adding", async () => {
		expect((await patch({ targetType: "member", targetIds: ["u-1", "u-outsider"], addGuardrailIds: ["g-1"] })).status).toBe(409);
		expect(mocks.writes).toEqual([]);
	});

	it("only removes rows in this workspace for a user from another workspace", async () => {
		expect((await patch({ targetType: "member", targetIds: ["u-outsider"], removeGuardrailIds: ["g-2"] })).status).toBe(200);
		expect(mocks.writes).toEqual([]);
	});

	it.each(["key", "member"])("rejects a guardrail from another workspace for %s targets", async (targetType) => {
		const targetIds = targetType === "key" ? ["k-1"] : ["u-1"];
		expect((await patch({ targetType, targetIds, addGuardrailIds: ["g-1", "g-foreign"] })).status).toBe(404);
		expect(mocks.writes).toEqual([]);
	});

	it.each(["member", "viewer"])("forbids the %s role", async (role) => {
		mocks.role = role;
		expect((await patch({ targetType: "key", targetIds: ["k-1"], addGuardrailIds: ["g-1"] })).status).toBe(403);
		expect(mocks.writes).toEqual([]);
	});

	it("forbids another workspace", async () => {
		expect((await patch({ workspaceId: "ws-2", targetType: "key", targetIds: ["k-foreign"], addGuardrailIds: ["g-foreign"] })).status).toBe(403);
		expect(mocks.writes).toEqual([]);
	});

	it("rejects a malformed change before touching the database", async () => {
		const response = await patch({ targetType: "key", targetIds: ["k-1"] });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "Nothing to change" });
		expect(mocks.writes).toEqual([]);
	});
});

describe("PATCH /guardrails/assignments for workspace and department levels", () => {
	const levelRows = () => (mocks.db.workspace_guardrail_assignments ?? []).map((row) => `${row.target_type}:${row.target_id ?? "-"}:${row.guardrail_id}`).sort();
	const activeKeys = ["k-1", "k-2", "k-3", "k-left"];

	it("adds and removes department guardrails and refreshes every key in the workspace", async () => {
		const response = await patch({ targetType: "department", targetIds: ["d-1", "d-2"], addGuardrailIds: ["g-1"], removeGuardrailIds: ["g-2"] });
		expect(response.status).toBe(200);
		expect(levelRows()).toEqual(["department:d-1:g-1", "department:d-2:g-1"]);
		expect(await invalidated()).toEqual(activeKeys);
	});

	it("assigns a guardrail to the whole workspace without target ids", async () => {
		expect((await patch({ targetType: "workspace", addGuardrailIds: ["g-1"] })).status).toBe(200);
		expect(levelRows()).toEqual(["department:d-2:g-2", "workspace:-:g-1"]);
		expect(await invalidated()).toEqual(activeKeys);
		expect((await patch({ targetType: "workspace", targetIds: [], removeGuardrailIds: ["g-1"] })).status).toBe(200);
		expect(levelRows()).toEqual(["department:d-2:g-2"]);
	});

	it("rejects target ids on a workspace change", async () => {
		const response = await patch({ targetType: "workspace", targetIds: ["ws-1"], addGuardrailIds: ["g-1"] });
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: "A workspace change takes no targetIds" });
		expect(mocks.writes).toEqual([]);
	});

	it.each([
		["a department from another workspace", ["d-1", "d-foreign"]],
		["an unknown department", ["d-missing"]],
	])("rejects %s without writing", async (_label, targetIds) => {
		const response = await patch({ targetType: "department", targetIds, addGuardrailIds: ["g-1"] });
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "One or more departments do not belong to this workspace" });
		expect(mocks.writes).toEqual([]);
		expect(mocks.waitUntil).not.toHaveBeenCalled();
	});

	it("rejects a guardrail from another workspace", async () => {
		expect((await patch({ targetType: "workspace", addGuardrailIds: ["g-foreign"] })).status).toBe(404);
		expect(mocks.writes).toEqual([]);
	});
});

describe("workspace-wide cache refresh", () => {
	it("reads every page of keys instead of stopping at the first 1,000", async () => {
		const extra = Array.from({ length: 1200 }, (_, index) => ({ id: `k-bulk-${String(index).padStart(4, "0")}`, workspace_id: "ws-1", status: "active", created_by: "u-2", oauth_user_id: null }));
		mocks.db.keys = [...(mocks.db.keys ?? []), ...extra];
		expect((await request("PUT", "/guardrails/g-1/members", { userIds: ["u-1"] })).status).toBe(200);
		const ids = await invalidated();
		expect(ids).toHaveLength(1204);
		expect(ids).toContain("k-bulk-1199");
		expect(ids).not.toContain("k-deleted");
	});
});

describe("per-guardrail target checks", () => {
	it("rejects a key from another workspace on PUT /keys", async () => {
		expect((await request("PUT", "/guardrails/g-1/keys", { keyIds: ["k-foreign"] })).status).toBe(409);
	});

	it("rejects a former member on PUT /members", async () => {
		expect((await request("PUT", "/guardrails/g-1/members", { userIds: ["u-left"] })).status).toBe(409);
	});
});
