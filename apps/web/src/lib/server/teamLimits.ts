import type { SupabaseClient } from "@supabase/supabase-js";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";

const TOP_UP_LEDGER_KINDS = ["top_up", "top_up_one_off", "auto_top_up"] as const;
const SUCCESS_PAYMENT_STATUSES = ["Succeeded", "succeeded", "paid", "Paid"] as const;
const DEFAULT_NON_ENTERPRISE_KEY_LIMIT = 100;

type DbClient = SupabaseClient<any, "public", any>;

export function getNonEnterpriseKeyLimit(): number {
	const raw = Number.parseInt(process.env.NON_ENTERPRISE_KEY_LIMIT ?? "", 10);
	if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_NON_ENTERPRISE_KEY_LIMIT;
	return raw;
}

export async function userHasPaidTeamAccess(
	admin: DbClient,
	userId: string
): Promise<boolean> {
	const { data: memberships, error: membershipsError } = await admin
		.from("team_members")
		.select("team_id, role")
		.eq("user_id", userId);

	if (membershipsError) throw membershipsError;

	const adminTeamIds = Array.from(
		new Set(
			(memberships ?? [])
				.filter((row: any) => {
					const role = String(row?.role ?? "").toLowerCase();
					return role === "owner" || role === "admin";
				})
				.map((row: any) => String(row?.team_id ?? ""))
				.filter(Boolean)
		)
	);

	if (!adminTeamIds.length) return false;

	const [
		{ count: topUpCount, error: topUpError },
		{ count: invoiceCount, error: invoiceError },
		{ count: enterpriseTeamCount, error: enterpriseError },
	] = await Promise.all([
		admin
			.from("credit_ledger")
			.select("id", { count: "exact", head: true })
			.in("team_id", adminTeamIds)
			.in("kind", [...TOP_UP_LEDGER_KINDS])
			.in("status", [...SUCCESS_PAYMENT_STATUSES])
			.gt("amount_nanos", 0),
		admin
			.from("team_invoices")
			.select("id", { count: "exact", head: true })
			.in("team_id", adminTeamIds)
			.eq("status", "paid")
			.gt("amount_nanos", 0),
		admin
			.from("teams")
			.select("id", { count: "exact", head: true })
			.in("id", adminTeamIds)
			.eq("tier", "enterprise"),
	]);

	if (topUpError) throw topUpError;
	if (invoiceError) throw invoiceError;
	if (enterpriseError) throw enterpriseError;

	return (
		(topUpCount ?? 0) > 0 ||
		(invoiceCount ?? 0) > 0 ||
		(enterpriseTeamCount ?? 0) > 0
	);
}

export async function enforceTeamKeyLimit(
	supabase: DbClient,
	teamId: string
): Promise<void> {
	const { data: teamRow, error: teamError } = await supabase
		.from("teams")
		.select("tier")
		.eq("id", teamId)
		.maybeSingle();

	if (teamError) throw teamError;

	const tier = String(teamRow?.tier ?? "basic").toLowerCase();
	if (tier === "enterprise") return;

	const keyLimit = getNonEnterpriseKeyLimit();

	const [
		{ count: apiKeyCount, error: apiKeyCountError },
		{ count: managementKeyCount, error: managementKeyCountError },
	] = await Promise.all([
		supabase
			.from("keys")
			.select("id", { count: "exact", head: true })
			.eq("team_id", teamId)
			.neq("name", CHAT_MANAGED_KEY_NAME),
		supabase
			.from("management_keys")
			.select("id", { count: "exact", head: true })
			.eq("team_id", teamId),
	]);

	if (apiKeyCountError) throw apiKeyCountError;
	if (managementKeyCountError) throw managementKeyCountError;

	const totalKeys = (apiKeyCount ?? 0) + (managementKeyCount ?? 0);
	if (totalKeys >= keyLimit) {
		throw new Error(
			`Key limit reached (${keyLimit}) for this team. Delete an existing key or upgrade to Enterprise for unlimited keys.`
		);
	}
}
