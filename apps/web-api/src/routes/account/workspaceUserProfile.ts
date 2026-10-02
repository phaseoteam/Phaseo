import type { AccountWorkspaceContext } from "./context";

// Call only after establishing the user's relationship to the workspace.
export async function workspaceUserProfile(context: AccountWorkspaceContext, userId: string) {
	const [profile, account] = await Promise.all([
		context.client.from("users").select("display_name").eq("user_id", userId).maybeSingle(),
		context.client.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } })),
	]);
	const metadata = account.data?.user?.user_metadata ?? {};
	const candidate = metadata.avatar_url ?? metadata.picture ?? metadata.picture_url;
	let avatarUrl: string | null = null;
	if (typeof candidate === "string") {
		try { const url = new URL(candidate); if (["https:", "http:"].includes(url.protocol)) avatarUrl = url.href; } catch { /* Fall back to initials. */ }
	}
	const name = profile.data?.display_name ?? metadata.full_name ?? metadata.name;
	return { id: userId, name: typeof name === "string" ? name.trim() || null : null, avatarUrl };
}
