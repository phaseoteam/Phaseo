import type { getDataClient } from "@/data/supabase";

// Account experience is separate from platform roles and catalog authorization.
// Joining somebody else's workspace must not convert a customer's account.
export function providerAccountWorkspaceId(userId: string, platformRole: string, links: Array<{ workspace_id?: string | null; linked_by?: string | null; status?: string | null }>): string | null {
	if (platformRole.toLowerCase() === "admin") return null;
	return links.find((link) => link.linked_by === userId && link.status === "active")?.workspace_id ?? null;
}

export function isProviderAccount(userId: string, platformRole: string, links: Array<{ workspace_id?: string | null; linked_by?: string | null; status?: string | null }>): boolean {
	return platformRole.toLowerCase() !== "admin"
		&& links.some((link) => link.linked_by === userId && link.status === "active");
}

export async function getProviderAccountMode(client: ReturnType<typeof getDataClient>, userId: string): Promise<boolean> {
	const [profile, memberships, owned] = await Promise.all([
		client.from("users").select("role").eq("user_id", userId).maybeSingle(),
		client.from("workspace_members").select("workspace_id").eq("user_id", userId),
		client.from("workspaces").select("id").eq("owner_user_id", userId),
	]);
	for (const result of [profile, memberships, owned]) if (result.error) throw result.error;
	if (String(profile.data?.role).toLowerCase() === "admin") return false;
	const workspaceIds = [...new Set([
		...(memberships.data ?? []).map((row) => row.workspace_id),
		...(owned.data ?? []).map((row) => row.id),
	])];
	if (!workspaceIds.length) return false;
	const links = await client.from("provider_account_links").select("workspace_id,linked_by,status")
		.in("workspace_id", workspaceIds).eq("linked_by", userId).eq("status", "active");
	if (links.error) throw links.error;
	return isProviderAccount(userId, String(profile.data?.role ?? "user"), links.data ?? []);
}
