// A SCIM Group create or PATCH is one RPC (one transaction): a failure leaves nothing half done, there
// is no separate cleanup or metadata write to fail, and only that whole call is retried.
import { describe, expect, it, vi } from "vitest";
import { ScimGroupService } from "./groups";
import { SCIM_URNS } from "./constants";

const GROUP = "40000000-0000-4000-8000-000000000001";
const NEW_USER = "50000000-0000-4000-8000-000000000002";
const OLD_USER = "50000000-0000-4000-8000-000000000001";
const deadlock = { code: "40P01", message: "deadlock detected" };
const groupRow = { id: GROUP, external_id: null, display_name: "Platform admins", version: 2, created_at: "2026-11-06T00:00:00Z", updated_at: "2026-11-06T00:00:00Z" };

function harness(failures: Array<{ code: string; message: string }> = []) {
	const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
	const tableWrites: string[] = [];
	const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
		rpcs.push({ name, args });
		const failure = failures.shift();
		const result = failure ? { data: null, error: failure } : { data: groupRow, error: null };
		const builder: Record<string, unknown> = {
			select: () => builder,
			single: async () => result,
			maybeSingle: async () => result,
		};
		return builder;
	});
	const from = (table: string) => {
		const builder: Record<string, unknown> = {};
		for (const method of ["select", "eq", "in", "order", "range", "limit"]) builder[method] = () => builder;
		for (const method of ["insert", "upsert", "update", "delete"]) builder[method] = () => { tableWrites.push(`${table}.${method}`); return builder; };
		builder.maybeSingle = async () => ({ data: groupRow, error: null });
		builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
		return builder;
	};
	const service = new ScimGroupService({ rpc, from } as never, "workspace_1", "https://phaseo.app/scim/v2");
	return { service, rpcs, tableWrites };
}

const patchBody = {
	schemas: [SCIM_URNS.patch],
	Operations: [
		{ op: "replace", path: "displayName", value: "Renamed" },
		{ op: "add", path: "members", value: [{ value: NEW_USER }] },
		{ op: "remove", path: `members[value eq "${OLD_USER}"]` },
	],
};

describe("SCIM Group PATCH", () => {
	it("sends every operation, in order, to one RPC and writes no table directly", async () => {
		const { service, rpcs, tableWrites } = harness();
		await service.patch(GROUP, patchBody);
		expect(rpcs).toEqual([{ name: "apply_scim_group_patch", args: { p_workspace_id: "workspace_1", p_group_id: GROUP, p_changes: [
			{ kind: "attributes", values: { display_name: "Renamed" } },
			{ kind: "members-add", user_ids: [NEW_USER] },
			{ kind: "members-remove", user_ids: [OLD_USER] },
		] } }]);
		expect(tableWrites).toEqual([]);
	});

	it("retries the whole PATCH after a deadlock", async () => {
		const { service, rpcs } = harness([deadlock, deadlock]);
		await expect(service.patch(GROUP, patchBody)).resolves.toMatchObject({ id: GROUP });
		expect(rpcs.map((call) => call.name)).toEqual(["apply_scim_group_patch", "apply_scim_group_patch", "apply_scim_group_patch"]);
	});

	it("returns the error once retries run out, with nothing written", async () => {
		const { service, rpcs, tableWrites } = harness([deadlock, deadlock, deadlock]);
		await expect(service.patch(GROUP, patchBody)).rejects.toMatchObject({ status: 500 });
		expect(rpcs).toHaveLength(3);
		expect(tableWrites).toEqual([]);
	});

	it("reports a failing operation (an unknown member) as a SCIM error", async () => {
		const { service } = harness([{ code: "23503", message: "SCIM user not found in workspace" }]);
		await expect(service.patch(GROUP, patchBody)).rejects.toMatchObject({ status: 400 });
	});
});

describe("SCIM Group create", () => {
	const createBody = { schemas: [SCIM_URNS.group], displayName: "Platform admins", members: [{ value: NEW_USER }] };

	it("creates the group and its members in one RPC, with no cleanup to fail", async () => {
		const { service, rpcs, tableWrites } = harness([deadlock]);
		await expect(service.create(createBody)).resolves.toMatchObject({ id: GROUP });
		expect(rpcs).toEqual([
			{ name: "create_scim_group", args: { p_workspace_id: "workspace_1", p_external_id: null, p_display_name: "Platform admins", p_user_ids: [NEW_USER] } },
			{ name: "create_scim_group", args: expect.anything() },
		]);
		expect(tableWrites).toEqual([]);
	});

	it("returns the error when every attempt fails, and never deletes or leaves a group", async () => {
		const { service, rpcs, tableWrites } = harness([deadlock, deadlock, deadlock]);
		await expect(service.create(createBody)).rejects.toMatchObject({ status: 500 });
		expect(rpcs).toHaveLength(3);
		expect(tableWrites).toEqual([]);
	});
});
