// A SCIM Group PATCH, from the request body to the database: the real parser and group service, and the
// real apply_scim_group_patch function with the SCIM reconcile, on PGlite (a root devDependency).
// Covers how identity providers phrase common changes: removing every member, attribute names in any
// case, and a pathless replace that sets the name and the members together.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SCIM_URNS } from "./constants";
import { ScimGroupService } from "./groups";

const supabase = new URL("../../../../supabase/", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, supabase), "utf8").replace(/\r\n/g, "\n");
const FUNCTIONS = ["reconcile_scim_entitlements", "reconcile_scim_entitlements_trigger", "refresh_effective_entitlements_after_directory_change",
	"refresh_workspace_effective_entitlements", "capture_manual_workspace_grant", "enforce_workspace_member_role_policy",
	"apply_workspace_role_overrides", "apply_scim_group_patch"];
const TRIGGERS: Record<string, string[]> = {
	scim_group_mappings: ["scim_group_mappings_reconcile", "zz_scim_group_mappings_refresh_effective"],
	scim_group_members: ["scim_group_members_reconcile", "zz_scim_group_members_refresh_effective"],
	workspace_members: ["workspace_members_capture_manual_grant", "workspace_members_role_policy_guard", "zz_workspace_members_refresh_effective"],
};

const WS = "10000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const ADMIN_A = "20000000-0000-4000-8000-000000000002";
const ADMIN_B = "20000000-0000-4000-8000-000000000003";
const ENGINEERING = "30000000-0000-4000-8000-000000000001";
const GROUP = "40000000-0000-4000-8000-000000000001";
const SCIM_A = "50000000-0000-4000-8000-000000000001";
const SCIM_B = "50000000-0000-4000-8000-000000000002";
const UNKNOWN = "50000000-0000-4000-8000-0000000000ff";

let db: PGlite;

/** Just the PostgREST calls the group service makes for a PATCH, run against PGlite. */
const client = {
	// The member read-back for the response.
	from(table: string) {
		const filters: Record<string, unknown> = {};
		const builder = {
			select: () => builder,
			eq: (column: string, value: unknown) => { filters[column] = value; return builder; },
			then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (async () => {
				if (table !== "scim_group_members") throw new Error(`unexpected table ${table}`);
				const result = await db.query<{ user_id: string }>("select user_id from public.scim_group_members where workspace_id = $1 and group_id = $2 order by user_id", [filters.workspace_id, filters.group_id]);
				return { data: result.rows.map((row) => ({ user_id: row.user_id, user: { display_name: null } })), error: null };
			})().then(resolve, reject),
		};
		return builder;
	},
	rpc(name: string, args: { p_workspace_id: string; p_group_id: string; p_changes: unknown }) {
		const run = async () => {
			if (name !== "apply_scim_group_patch") throw new Error(`unexpected rpc ${name}`);
			try {
				const result = await db.query("select * from public.apply_scim_group_patch($1, $2, $3::jsonb)", [args.p_workspace_id, args.p_group_id, JSON.stringify(args.p_changes)]);
				return { data: result.rows[0] ?? null, error: null };
			} catch (error) {
				const { code, message } = error as { code?: string; message: string };
				return { data: null, error: { code: code ?? "XX000", message } };
			}
		};
		const builder = { select: () => builder, maybeSingle: run, single: run };
		return builder;
	},
};
const service = () => new ScimGroupService(client as never, WS, "https://phaseo.app/scim/v2");
const patch = (...Operations: Array<Record<string, unknown>>) => service().patch(GROUP, { schemas: [SCIM_URNS.patch], Operations });
const members = async () => (await db.query<{ user_id: string }>("select user_id from public.scim_group_members where group_id = $1 order by user_id", [GROUP])).rows.map((row) => row.user_id);
const displayName = async () => (await db.query<{ display_name: string }>("select display_name from public.scim_groups where id = $1", [GROUP])).rows[0]?.display_name;
const roleOf = async (user: string) => (await db.query<{ role: string }>("select role::text from public.workspace_members where workspace_id = $1 and user_id = $2", [WS, user])).rows[0]?.role ?? null;

beforeAll(async () => {
	db = new PGlite();
	await db.exec(read("tests/fixtures/workspace-directory-schema.sql"));
	for (const fn of FUNCTIONS) await db.exec(read(`schemas/public/functions/${fn}.sql`));
	for (const [table, names] of Object.entries(TRIGGERS)) {
		const sql = read(`schemas/public/tables/${table}.sql`);
		for (const name of names) {
			const trigger = sql.match(new RegExp(`CREATE TRIGGER ${name}\\n[\\s\\S]*?;`))?.[0];
			if (!trigger) throw new Error(`${table} declares ${name}`);
			await db.exec(trigger);
		}
	}
	await db.exec(`
		insert into public.workspaces values ('${WS}', '${OWNER}');
		insert into public.workspace_members (workspace_id, user_id, role) values ('${WS}', '${OWNER}', 'owner');
		insert into public.workspace_departments (id, workspace_id, name) values ('${ENGINEERING}', '${WS}', 'Engineering');
		insert into public.scim_users (id, workspace_id, auth_user_id) values ('${SCIM_A}', '${WS}', '${ADMIN_A}'), ('${SCIM_B}', '${WS}', '${ADMIN_B}');
		insert into public.scim_groups (id, workspace_id, display_name) values ('${GROUP}', '${WS}', 'Platform admins');
		-- Owner-made mapping: everyone in the group is an admin.
		insert into public.scim_group_mappings (workspace_id, scim_group_id, department_id, access_role) values ('${WS}', '${GROUP}', '${ENGINEERING}', 'admin');
	`);
});

afterAll(async () => {
	await db.close();
});

beforeEach(async () => {
	// Start each case with A and B in the group (both admins through the mapping) and the original name.
	await db.query("select * from public.apply_scim_group_patch($1, $2, $3::jsonb)", [WS, GROUP, JSON.stringify([
		{ kind: "attributes", values: { display_name: "Platform admins" } },
		{ kind: "members-replace", user_ids: [SCIM_A, SCIM_B] },
	])]);
	expect([await roleOf(ADMIN_A), await roleOf(ADMIN_B)]).toEqual(["admin", "admin"]);
});

describe("SCIM Group PATCH, parser to database", () => {
	it("removes every member for a remove on the members path without a value, and their mapped admin role with them", async () => {
		await patch({ op: "remove", path: "members" });
		expect(await members()).toEqual([]);
		expect([await roleOf(ADMIN_A), await roleOf(ADMIN_B)]).toEqual([null, null]);
	});

	it("still removes only the listed members when the remove has a value", async () => {
		await patch({ op: "remove", path: "members", value: [{ value: SCIM_A }] });
		expect(await members()).toEqual([SCIM_B]);
		expect(await roleOf(ADMIN_A)).toBeNull();
	});

	it("matches attribute paths in any case", async () => {
		await patch(
			{ op: "Replace", path: "DISPLAYNAME", value: "Renamed" },
			{ op: "remove", path: "Members", value: [{ value: SCIM_B }] },
			{ op: "Remove", path: `MEMBERS[value eq "${SCIM_A}"]` },
		);
		expect(await displayName()).toBe("Renamed");
		expect(await members()).toEqual([]);
		await patch({ op: "add", path: "members", value: [{ value: SCIM_A }] }, { op: "replace", path: "ExternalId", value: "okta-123" });
		expect(await members()).toEqual([SCIM_A]);
		expect((await db.query<{ external_id: string }>("select external_id from public.scim_groups where id = $1", [GROUP])).rows[0].external_id).toBe("okta-123");
	});

	it("applies both the name and the members of a pathless replace", async () => {
		const group = await patch({ op: "replace", value: { id: GROUP, displayName: "Renamed", members: [{ value: SCIM_B }] } });
		expect(group).toMatchObject({ displayName: "Renamed" });
		expect(await displayName()).toBe("Renamed");
		expect(await members()).toEqual([SCIM_B]);
		expect([await roleOf(ADMIN_A), await roleOf(ADMIN_B)]).toEqual([null, "admin"]);
	});

	it("applies a pathless replace in one transaction: an unknown member leaves the name unchanged too", async () => {
		await expect(patch({ op: "replace", value: { displayName: "Renamed", members: [{ value: UNKNOWN }] } })).rejects.toMatchObject({ status: 400 });
		expect(await displayName()).toBe("Platform admins");
		expect(await members()).toEqual([SCIM_A, SCIM_B]);
	});

	it("ignores the read-only attributes a client echoes back (id, meta, schemas, in any case) and applies the rest", async () => {
		await patch({ op: "replace", value: {
			ID: GROUP,
			SCHEMAS: [SCIM_URNS.group],
			Meta: { resourceType: "Group", created: "2026-01-01T00:00:00Z", lastModified: "2026-01-02T00:00:00Z", version: 'W/"1"', location: `https://phaseo.app/scim/v2/Groups/${GROUP}` },
			displayName: "Renamed",
			members: [{ value: SCIM_B }],
		} });
		expect(await displayName()).toBe("Renamed");
		expect(await members()).toEqual([SCIM_B]);
		expect([await roleOf(ADMIN_A), await roleOf(ADMIN_B)]).toEqual([null, "admin"]);
		// meta is ignored, not applied: the group keeps its own timestamps.
		const { created_at } = (await db.query<{ created_at: Date }>("select created_at from public.scim_groups where id = $1", [GROUP])).rows[0];
		expect(created_at.toISOString()).not.toBe("2026-01-01T00:00:00.000Z");
	});

	it("rejects an attribute a Group doesn't have instead of ignoring it", async () => {
		await expect(patch({ op: "replace", value: { displayName: "Renamed", owners: [] } })).rejects.toMatchObject({ status: 400 });
		expect(await displayName()).toBe("Platform admins");
	});
});
