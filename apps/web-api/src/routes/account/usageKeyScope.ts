import type { AccountWorkspaceContext } from "./context";

export async function usageKeyScope(context: AccountWorkspaceContext, url: URL) {
	const creatorId = url.searchParams.get("user")?.trim() || null;
	let creatorKeyIds: string[] | null = null;
	if (creatorId) {
		const result = await context.client.from("keys").select("id").eq("workspace_id", context.workspaceId).eq("created_by", creatorId);
		if (result.error) throw result.error;
		creatorKeyIds = (result.data ?? []).map((key) => String(key.id));
	}
	const keyId = url.searchParams.get("key")?.trim() || null;
	return { creatorId, creatorKeyIds, apply: <T>(query: T): T => {
		let scoped = query as any;
		if (keyId) scoped = url.searchParams.get("key_op") === "is_not" ? scoped.neq("key_id", keyId) : scoped.eq("key_id", keyId);
		if (creatorKeyIds !== null) scoped = scoped.in("key_id", creatorKeyIds.length ? creatorKeyIds : ["00000000-0000-0000-0000-000000000000"]);
		return scoped as T;
	} };
}
