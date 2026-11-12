import type { SupabaseClient } from "@supabase/supabase-js";
import { ScimProtocolError } from "./errors";
import type { ScimFilter } from "./filter";
import { parseScimGroupInput, toScimGroup, type ScimGroupMember, type ScimGroupRow } from "./group";
import { parseGroupPatch } from "./group-patch";
import { retryTransaction } from "@/data/retry-transaction";

const GROUP_COLUMNS = "id,external_id,display_name,version,created_at,updated_at";
const FILTER_COLUMNS: Record<string, string> = { displayName: "display_name_normalized", externalId: "external_id", id: "id" };

function databaseError(error: { code?: string } | null, fallback: string): never {
	if (error?.code === "23505") throw new ScimProtocolError(409, "A Group with the same unique attribute already exists.", "uniqueness");
	if (error?.code === "23503") throw new ScimProtocolError(400, "A referenced User does not exist in this workspace.", "invalidValue");
	if (error?.code === "P0002") throw new ScimProtocolError(404, "Group not found.", "noTarget");
	throw new ScimProtocolError(500, fallback);
}

export class ScimGroupService {
	constructor(private readonly client: SupabaseClient, private readonly workspaceId: string, private readonly baseUrl: string) {}

	private async members(groupId: string): Promise<ScimGroupMember[]> {
		const result = await this.client.from("scim_group_members").select("user_id,user:scim_users!inner(display_name,workspace_id)").eq("workspace_id", this.workspaceId).eq("group_id", groupId).eq("user.workspace_id", this.workspaceId);
		if (result.error) databaseError(result.error, "Unable to retrieve Group members.");
		return (result.data ?? []).map((row) => { const userValue = row.user as unknown; const user = (Array.isArray(userValue) ? userValue[0] : userValue) as { display_name?: string } | null; return { value: String(row.user_id), display: user?.display_name ?? undefined }; });
	}

	private async representation(row: ScimGroupRow) { return toScimGroup(row, await this.members(row.id), this.baseUrl); }

	async create(value: unknown) {
		const input = parseScimGroupInput(value);
		// The group and its members are created in one transaction (create_scim_group), so a failure leaves
		// no group behind and there is nothing to clean up; only that whole call is retried.
		const result = await retryTransaction(() => this.client.rpc("create_scim_group", { p_workspace_id: this.workspaceId, p_external_id: input.externalId ?? null, p_display_name: input.displayName, p_user_ids: [...new Set(input.members.map((member) => member.value))] }).select(GROUP_COLUMNS).single());
		if (result.error) databaseError(result.error, "Unable to create Group.");
		return this.representation(result.data as ScimGroupRow);
	}

	async get(id: string) {
		const result = await this.client.from("scim_groups").select(GROUP_COLUMNS).eq("workspace_id", this.workspaceId).eq("id", id).maybeSingle();
		if (result.error) databaseError(result.error, "Unable to retrieve Group.");
		if (!result.data) throw new ScimProtocolError(404, "Group not found.", "noTarget");
		return this.representation(result.data as ScimGroupRow);
	}

	async list(filter: ScimFilter | null, startIndex: number, count: number) {
		let query = this.client.from("scim_groups").select(GROUP_COLUMNS, { count: "exact" }).eq("workspace_id", this.workspaceId);
		if (filter) for (const condition of filter.conditions) { const column = FILTER_COLUMNS[condition.attribute]; if (!column) throw new ScimProtocolError(400, `Filtering by ${condition.attribute} is not supported for Groups.`, "invalidFilter"); query = query.eq(column, condition.attribute === "displayName" ? condition.value.toLowerCase() : condition.value); }
		const result = count === 0 ? await query.limit(0) : await query.order("created_at").range(startIndex - 1, startIndex + count - 2);
		if (result.error) databaseError(result.error, "Unable to list Groups.");
		return { resources: await Promise.all((result.data ?? []).map((row) => this.representation(row as ScimGroupRow))), totalResults: result.count ?? 0 };
	}

	async replace(id: string, value: unknown) {
		const input = parseScimGroupInput(value);
		const result = await retryTransaction(() => this.client.rpc("replace_scim_group", { p_workspace_id: this.workspaceId, p_group_id: id, p_external_id: input.externalId ?? null, p_display_name: input.displayName, p_user_ids: [...new Set(input.members.map((member) => member.value))] }).select(GROUP_COLUMNS).maybeSingle());
		if (result.error) databaseError(result.error, "Unable to replace Group."); if (!result.data) throw new ScimProtocolError(404, "Group not found.", "noTarget");
		return this.representation(result.data as ScimGroupRow);
	}

	async patch(id: string, value: unknown) {
		// All operations and the metadata change apply in one transaction (apply_scim_group_patch): a later
		// operation failing rolls back the earlier ones, and only that whole call is retried.
		const changes = parseGroupPatch(value).map((change) => change.kind === "attributes"
			? { kind: change.kind, values: change.values }
			: { kind: change.kind, user_ids: change.userIds });
		const result = await retryTransaction(() => this.client.rpc("apply_scim_group_patch", { p_workspace_id: this.workspaceId, p_group_id: id, p_changes: changes }).select(GROUP_COLUMNS).maybeSingle());
		if (result.error) databaseError(result.error, "Unable to patch Group.");
		if (!result.data) throw new ScimProtocolError(404, "Group not found.", "noTarget");
		return this.representation(result.data as ScimGroupRow);
	}

	async delete(id: string) { const result = await retryTransaction(() => this.client.from("scim_groups").delete().eq("workspace_id", this.workspaceId).eq("id", id).select("id").maybeSingle()); if (result.error) databaseError(result.error, "Unable to delete Group."); if (!result.data) throw new ScimProtocolError(404, "Group not found.", "noTarget"); }
}
