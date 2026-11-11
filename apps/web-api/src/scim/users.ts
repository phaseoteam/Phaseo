import type { SupabaseClient } from "@supabase/supabase-js";
import { ScimProtocolError } from "./errors";
import type { ScimFilter } from "./filter";
import { parseScimUserInput, toScimUser, userInputToRow, type ScimUserRow } from "./user";
import { parseUserPatch } from "./patch";
import { retryTransaction } from "@/data/retry-transaction";

const USER_COLUMNS = "id,external_id,user_name,active,display_name,given_name,family_name,employee_number,cost_center,organization,division,department,manager_scim_user_id,emails,phone_numbers,addresses,locale,preferred_language,timezone,title,user_type,version,created_at,updated_at";
const FILTER_COLUMNS: Record<string, string> = { userName: "user_name_normalized", externalId: "external_id", id: "id" };

function databaseError(error: { code?: string; message?: string } | null, fallback: string): never {
	if (error?.code === "23505") throw new ScimProtocolError(409, "A User with the same unique attribute already exists.", "uniqueness");
	if (error?.code === "23503") throw new ScimProtocolError(400, "The referenced manager does not exist.", "invalidValue");
	throw new ScimProtocolError(500, fallback);
}

export class ScimUserService {
	constructor(private readonly client: SupabaseClient, private readonly workspaceId: string, private readonly baseUrl: string) {}

	async create(value: unknown) {
		const row = { workspace_id: this.workspaceId, ...userInputToRow(parseScimUserInput(value)) };
		const result = await retryTransaction(() => this.client.from("scim_users").insert(row).select(USER_COLUMNS).single());
		if (result.error) databaseError(result.error, "Unable to create User.");
		return toScimUser(result.data as ScimUserRow, this.baseUrl);
	}

	async get(id: string) {
		const result = await this.client.from("scim_users").select(USER_COLUMNS).eq("workspace_id", this.workspaceId).eq("id", id).maybeSingle();
		if (result.error) databaseError(result.error, "Unable to retrieve User.");
		if (!result.data) throw new ScimProtocolError(404, "User not found.", "noTarget");
		return toScimUser(result.data as ScimUserRow, this.baseUrl);
	}

	async list(filter: ScimFilter | null, startIndex: number, count: number) {
		let query = this.client.from("scim_users").select(USER_COLUMNS, { count: "exact" }).eq("workspace_id", this.workspaceId);
		if (filter) for (const condition of filter.conditions) {
			const column = FILTER_COLUMNS[condition.attribute];
			if (!column) throw new ScimProtocolError(400, `Filtering by ${condition.attribute} is not supported for Users.`, "invalidFilter");
			query = query.eq(column, condition.attribute === "userName" ? condition.value.toLowerCase() : condition.value);
		}
		const result = count === 0 ? await query.limit(0) : await query.order("created_at").range(startIndex - 1, startIndex + count - 2);
		if (result.error) databaseError(result.error, "Unable to list Users.");
		return { resources: (result.data ?? []).map((row) => toScimUser(row as ScimUserRow, this.baseUrl)), totalResults: result.count ?? 0 };
	}

	async replace(id: string, value: unknown) {
		const input = parseScimUserInput(value);
		const result = await retryTransaction(() => this.client.from("scim_users").update(userInputToRow(input)).eq("workspace_id", this.workspaceId).eq("id", id).select(USER_COLUMNS).maybeSingle());
		if (result.error) databaseError(result.error, "Unable to replace User.");
		if (!result.data) throw new ScimProtocolError(404, "User not found.", "noTarget");
		return toScimUser(result.data as ScimUserRow, this.baseUrl);
	}

	async patch(id: string, value: unknown) {
		const current = await this.client.from("scim_users").select(USER_COLUMNS).eq("workspace_id", this.workspaceId).eq("id", id).maybeSingle();
		if (current.error) databaseError(current.error, "Unable to retrieve User.");
		if (!current.data) throw new ScimProtocolError(404, "User not found.", "noTarget");
		const changes = parseUserPatch(value, current.data);
		const result = await retryTransaction(() => this.client.from("scim_users").update(changes).eq("workspace_id", this.workspaceId).eq("id", id).select(USER_COLUMNS).maybeSingle());
		if (result.error) databaseError(result.error, "Unable to patch User.");
		if (!result.data) throw new ScimProtocolError(404, "User not found.", "noTarget");
		return toScimUser(result.data as ScimUserRow, this.baseUrl);
	}

	async deactivate(id: string) {
		const result = await retryTransaction(() => this.client.from("scim_users").update({ active: false }).eq("workspace_id", this.workspaceId).eq("id", id).select(USER_COLUMNS).maybeSingle());
		if (result.error) databaseError(result.error, "Unable to deactivate User.");
		if (!result.data) throw new ScimProtocolError(404, "User not found.", "noTarget");
		return toScimUser(result.data as ScimUserRow, this.baseUrl);
	}
}
