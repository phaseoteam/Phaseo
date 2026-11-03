import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
	workspace: "ws-1",
	role: "admin",
	signedIn: true,
	db: {} as Record<string, Row[]>,
	writes: [] as Array<{ table: string; op: "delete" | "upsert" }>,
	waitUntil: vi.fn(),
}));

// A small in-memory PostgREST stand-in: filters apply to select and delete, and upsert skips rows that clash on `onConflict`.
function fakeClient() {
	return {
		from(table: string) {
			const filters: Array<(row: Row) => boolean> = [];
			let op: "select" | "delete" = "select";
			const run = () => {
				const rows = mocks.db[table] ?? [];
				const matches = rows.filter((row) => filters.every((filter) => filter(row)));
				if (op === "delete") {
					mocks.writes.push({ table, op });
					mocks.db[table] = rows.filter((row) => !matches.includes(row));
				}
				return { data: matches, error: null };
			};
			const builder: any = {
				select: () => builder,
				delete: () => { op = "delete"; return builder; },
				eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
				neq: (column: string, value: unknown) => { filters.push((row) => row[column] !== value); return builder; },
				in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
				upsert: async (rows: Row[], options: { onConflict: string; ignoreDuplicates?: boolean }) => {
					mocks.writes.push({ table, op: "upsert" });
					const columns = options.onConflict.split(",");
					const keyOf = (row: Row) => columns.map((column) => String(row[column])).join("|");
					const existing = new Set((mocks.db[table] ?? []).map(keyOf));
					mocks.db[table] = [...(mocks.db[table] ?? []), ...rows.filter((row) => !existing.has(keyOf(row)))];
					return { data: null, error: null };
				},
				then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
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

const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsGuardrailsRouter);
const patch = (body: Row) => app.request("https://example.com/guardrails/assignments", {
	method: "PATCH",
	headers: { "content-type": "application/json" },
	body: JSON.stringify({ workspaceId: mocks.workspace, ...body }),
}, {} as Env, { waitUntil: mocks.waitUntil, passThroughOnException: () => {}, props: {} } as any);
const pairs = (table: string, column: string) => (mocks.db[table] ?? []).map((row) => `${row[column]}:${row.guardrail_id}`).sort();

beforeEach(() => {
	mocks.role = "admin";
	mocks.signedIn = true;
	mocks.writes.length = 0;
	mocks.waitUntil.mockReset();
	mocks.db = {
		workspace_guardrails: [{ id: "g-1", workspace_id: "ws-1" }, { id: "g-2", workspace_id: "ws-1" }, { id: "g-foreign", workspace_id: "ws-2" }],
		keys: [
			{ id: "k-1", workspace_id: "ws-1", status: "active" },
			{ id: "k-2", workspace_id: "ws-1", status: "active" },
			{ id: "k-3", workspace_id: "ws-1", status: "active" },
			{ id: "k-deleted", workspace_id: "ws-1", status: "deleted" },
			{ id: "k-foreign", workspace_id: "ws-2", status: "active" },
		],
		workspace_members: [{ workspace_id: "ws-1", user_id: "u-1" }, { workspace_id: "ws-1", user_id: "u-2" }, { workspace_id: "ws-2", user_id: "u-outsider" }],
		key_guardrails: [
			{ key_id: "k-1", guardrail_id: "g-2" },
			{ key_id: "k-2", guardrail_id: "g-1" },
			{ key_id: "k-3", guardrail_id: "g-2" },
		],
		workspace_member_guardrails: [
			{ workspace_id: "ws-1", user_id: "u-1", guardrail_id: "g-2" },
			{ workspace_id: "ws-1", user_id: "u-2", guardrail_id: "g-2" },
			{ workspace_id: "ws-2", user_id: "u-1", guardrail_id: "g-2" },
		],
	};
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
			.toEqual(["ws-1:u-1:g-1", "ws-1:u-2:g-2", "ws-2:u-1:g-2"]);
	});

	it.each([
		["a key from another workspace", ["k-1", "k-foreign"]],
		["a deleted key", ["k-deleted"]],
		["an unknown key", ["k-missing"]],
	])("rejects %s without writing", async (_label, targetIds) => {
		expect((await patch({ targetType: "key", targetIds, addGuardrailIds: ["g-1"] })).status).toBe(409);
		expect(mocks.writes).toEqual([]);
		expect(mocks.waitUntil).not.toHaveBeenCalled();
	});

	it("rejects a user who is not a member of this workspace", async () => {
		expect((await patch({ targetType: "member", targetIds: ["u-1", "u-outsider"], removeGuardrailIds: ["g-2"] })).status).toBe(409);
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
		expect((await patch({ targetType: "key", targetIds: ["k-1"] })).status).toBe(400);
		expect(mocks.writes).toEqual([]);
	});
});
