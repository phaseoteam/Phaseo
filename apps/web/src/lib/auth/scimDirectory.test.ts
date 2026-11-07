// A sign-in is linked to a workspace's directory user only through the identity provider saved in that
// workspace's settings, which only the workspace owner can change. A provider an admin tried to set, and
// that was refused, never links anyone.
import { beforeEach, describe, expect, it } from "vitest";
import { linkScimDirectoryUser } from "./scimDirectory";

const WORKSPACE = "workspace_1";
const OWNER_PROVIDER = "5f6ec0f5-d5ce-4f71-99df-5f720ea59750";
const ADMIN_PROVIDER = "6a7ec0f5-d5ce-4f71-99df-5f720ea59751";
const SIGNED_IN = "auth_user_1";

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

function query(table: string) {
	const filters: Array<(row: Row) => boolean> = [];
	let update: Row | null = null;
	let upsert: Row | null = null;
	const run = () => {
		if (upsert) {
			tables[table] = [...(tables[table] ?? []), upsert];
			return [upsert];
		}
		const hit = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
		if (update) hit.forEach((row) => Object.assign(row, update));
		return hit;
	};
	const builder: Record<string, unknown> = {
		select: () => builder,
		eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
		in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
		is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
		update: (value: Row) => { update = value; return builder; },
		upsert: (value: Row) => { upsert = value; return builder; },
		maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
		then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
	};
	return builder;
}

const admin = { from: (table: string) => query(table) } as never;

beforeEach(() => {
	tables = {
		// A pending directory user provisioned by SCIM, not yet linked to a sign-in.
		scim_users: [{ id: "scim_user_1", workspace_id: WORKSPACE, auth_user_id: null, user_name_normalized: "dana@example.com", active: true }],
		// The provider the owner saved. The admin's attempt to switch it was refused, so it isn't here.
		workspace_settings: [{ workspace_id: WORKSPACE, sso_enabled: true, sso_provider_identifier: OWNER_PROVIDER }],
		scim_endpoints: [{ workspace_id: WORKSPACE, enabled: true }],
		workspace_addon_subscriptions: [{ workspace_id: WORKSPACE, addon_key: "identity", status: "active", grace_until: null }],
		users: [],
	};
});

describe("linking a sign-in to a directory user", () => {
	it("doesn't link a sign-in through a provider the owner didn't save", async () => {
		const result = await linkScimDirectoryUser({ admin, authUserId: SIGNED_IN, email: "dana@example.com", ssoProviderId: ADMIN_PROVIDER });
		expect(result).toBeNull();
		expect(tables.scim_users[0].auth_user_id).toBeNull();
		expect(tables.users).toEqual([]);
	});

	it("links a sign-in through the provider the owner saved", async () => {
		const result = await linkScimDirectoryUser({ admin, authUserId: SIGNED_IN, email: "dana@example.com", ssoProviderId: OWNER_PROVIDER });
		expect(result).toEqual({ workspaceId: WORKSPACE, scimUserId: "scim_user_1" });
		expect(tables.scim_users[0].auth_user_id).toBe(SIGNED_IN);
	});
});
