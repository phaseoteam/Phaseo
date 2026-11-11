// A SCIM token can add people to directory groups that grant the admin role, so only a token the current
// workspace owner issued works. Runs the real authentication, router and group service against an
// in-memory database.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDataClient } from "@/data/supabase";
import { hashScimToken, SCIM_TOKEN_OWNER_REQUIRED } from "./auth";
import { SCIM_URNS } from "./constants";
import { createScimRouter } from "./router";

vi.mock("@/data/supabase", () => ({ getDataClient: vi.fn() }));

const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const ADMIN = "20000000-0000-4000-8000-000000000002";
const GROUP = "30000000-0000-4000-8000-000000000001";
const MEMBER = "40000000-0000-4000-8000-000000000001";
const token = `ph_scim_12345678_${"a".repeat(64)}`;
const env = { ENV: "development" as const, SCIM_TOKEN_PEPPER: "p".repeat(32) };

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

/** Just enough of the query builder for authentication and a Group PATCH. */
function query(table: string) {
	const filters: Array<(row: Row) => boolean> = [];
	let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
	let payload: Row | Row[] | null = null;
	const rows = () => (tables[table] ??= []);
	const run = () => {
		const hit = rows().filter((row) => filters.every((filter) => filter(row)));
		if (op === "update") hit.forEach((row) => Object.assign(row, payload));
		if (op === "insert" || op === "upsert") rows().push(...(Array.isArray(payload) ? payload : [payload as Row]));
		if (op === "delete") tables[table] = rows().filter((row) => !hit.includes(row));
		return { data: hit, error: null, count: hit.length };
	};
	const builder: Record<string, unknown> = {
		select: () => builder,
		eq: (column: string, value: unknown) => {
			// Embedded filters such as "user.workspace_id" are not modelled.
			if (!column.includes(".")) filters.push((row) => row[column] === value);
			return builder;
		},
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
		update: (value: Row) => { op = "update"; payload = value; return builder; },
		insert: (value: Row | Row[]) => { op = "insert"; payload = value; return builder; },
		upsert: (value: Row | Row[]) => { op = "upsert"; payload = value; return builder; },
		delete: () => { op = "delete"; return builder; },
		maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
		single: async () => ({ data: run().data[0] ?? null, error: null }),
		then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
	};
	return builder;
}

async function seed(createdBy: string) {
	for (const key of Object.keys(tables)) delete tables[key];
	tables.scim_tokens = [{
		id: "token-1", token_prefix: "12345678", token_hash: await hashScimToken(env as never, token), expires_at: null, revoked_at: null,
		created_by: createdBy, endpoint: { id: "endpoint-1", workspace_id: WORKSPACE, enabled: true },
	}];
	tables.workspaces = [{ id: WORKSPACE, owner_user_id: OWNER }];
	tables.workspace_addon_subscriptions = [{ workspace_id: WORKSPACE, addon_key: "identity", status: "active", grace_until: null }];
	// An owner-mapped group: membership grants the admin role.
	tables.scim_groups = [{ id: GROUP, workspace_id: WORKSPACE, external_id: null, display_name: "Platform admins", version: 1, created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" }];
	tables.scim_group_members = [];
}

/** A Group PATCH is one database function; this models its member additions. */
function rpc(name: string, args: { p_workspace_id: string; p_group_id: string; p_changes: Array<{ kind: string; user_ids?: string[] }> }) {
	const run = () => {
		if (name !== "apply_scim_group_patch") return { data: null, error: { code: "42883", message: `unexpected rpc ${name}` } };
		const group = tables.scim_groups.find((row) => row.id === args.p_group_id && row.workspace_id === args.p_workspace_id);
		for (const change of args.p_changes) {
			for (const user_id of change.kind === "members-add" ? change.user_ids ?? [] : []) tables.scim_group_members.push({ workspace_id: args.p_workspace_id, group_id: args.p_group_id, user_id });
		}
		return { data: group ?? null, error: null };
	};
	const builder: Record<string, unknown> = { select: () => builder, maybeSingle: async () => run(), single: async () => run() };
	return builder;
}

function addToGroup() {
	return createScimRouter().request(`https://phaseo.app/Groups/${GROUP}`, {
		method: "PATCH",
		headers: { authorization: `Bearer ${token}`, "content-type": "application/scim+json" },
		body: JSON.stringify({ schemas: [SCIM_URNS.patch], Operations: [{ op: "add", path: "members", value: [{ value: MEMBER }] }] }),
	}, env);
}

describe("SCIM tokens act only for the current workspace owner", () => {
	beforeEach(() => {
		vi.mocked(getDataClient).mockReturnValue({ from: (table: string) => query(table), rpc } as never);
	});

	it("refuses a token an admin issued, and changes no group membership", async () => {
		await seed(ADMIN);
		const response = await addToGroup();
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ schemas: [SCIM_URNS.error], status: "401", detail: SCIM_TOKEN_OWNER_REQUIRED });
		expect(tables.scim_group_members).toEqual([]);
		expect(tables.scim_tokens[0]).toMatchObject({ created_by: ADMIN, revoked_at: null });
	});

	it("refuses a previous owner's token after the workspace changes hands", async () => {
		await seed(OWNER);
		tables.workspaces[0].owner_user_id = ADMIN;
		const response = await addToGroup();
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ detail: SCIM_TOKEN_OWNER_REQUIRED });
		expect(tables.scim_group_members).toEqual([]);
	});

	it("accepts a token the owner issued", async () => {
		await seed(OWNER);
		const response = await addToGroup();
		expect(response.status).toBe(200);
		expect(tables.scim_group_members).toEqual([{ workspace_id: WORKSPACE, group_id: GROUP, user_id: MEMBER }]);
	});
});
