import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";

const TOP_UP_LEDGER_KINDS = ["top_up", "top_up_one_off", "auto_top_up"] as const;
const SUCCESS_PAYMENT_STATUSES = ["Succeeded", "succeeded", "paid", "Paid"] as const;
const DEFAULT_KEY_LIMIT = 100;

type DbClient = SupabaseClient<any, "public", any>;

export function getWorkspaceKeyLimit(): number {
	const raw = Number.parseInt(
		process.env.WORKSPACE_KEY_LIMIT ?? process.env.NON_ENTERPRISE_KEY_LIMIT ?? "",
		10,
	);
	if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_KEY_LIMIT;
	return raw;
}

export async function userHasPaidTeamAccess(
	admin: DbClient,
	userId: string
): Promise<boolean> {
	const { data: memberships, error: membershipsError } = await admin
		.from("workspace_members")
		.select("workspace_id, role")
		.eq("user_id", userId);

	if (membershipsError) throw membershipsError;

	const adminTeamIds = Array.from(
		new Set(
			(memberships ?? [])
				.filter((row: any) => {
					const role = String(row?.role ?? "").toLowerCase();
					return role === "owner" || role === "admin";
				})
				.map((row: any) => String(row?.workspace_id ?? ""))
				.filter(Boolean)
		)
	);

	if (!adminTeamIds.length) return false;

	const [
		{ count: topUpCount, error: topUpError },
	] = await Promise.all([
		admin
			.from("credit_ledger")
			.select("id", { count: "exact", head: true })
			.in("workspace_id", adminTeamIds)
			.in("kind", [...TOP_UP_LEDGER_KINDS])
			.in("status", [...SUCCESS_PAYMENT_STATUSES])
			.gt("amount_nanos", 0),
	]);

	if (topUpError) throw topUpError;
	return (topUpCount ?? 0) > 0;
}

export async function enforceTeamKeyLimit(
	supabase: DbClient,
	workspaceId: string
): Promise<void> {
	const keyLimit = getWorkspaceKeyLimit();

	const [
		{ count: apiKeyCount, error: apiKeyCountError },
		{ count: managementKeyCount, error: managementKeyCountError },
	] = await Promise.all([
		supabase
			.from("keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspaceId)
			.neq("status", "deleted")
			.neq("name", CHAT_MANAGED_KEY_NAME),
		supabase
			.from("management_keys")
			.select("id", { count: "exact", head: true })
			.eq("workspace_id", workspaceId),
	]);

	if (apiKeyCountError) throw apiKeyCountError;
	if (managementKeyCountError) throw managementKeyCountError;

	const totalKeys = (apiKeyCount ?? 0) + (managementKeyCount ?? 0);
	if (totalKeys >= keyLimit) {
		throw new Error(
			`Key limit reached (${keyLimit}) for this workspace. Delete an existing key to create a new one.`
		);
	}
}
