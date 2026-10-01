import { requireUser, type AuthenticatedUser } from "@/auth/requireUser";
import { getAuthenticatedDataClient, getDataClient } from "@/data/supabase";
import type { Env } from "@/env";

export type AccountWorkspaceContext = {
	user: AuthenticatedUser;
	client: ReturnType<typeof getDataClient>;
	userClient: ReturnType<typeof getDataClient>;
	workspaceId: string;
	workspaceSlug: string;
	workspaceName: string;
	workspaceLogoUrl: string | null;
	role: string;
	isOwner: boolean;
};

function cookieValue(request: Request, name: string): string | null {
	for (const segment of (request.headers.get("cookie") ?? "").split(";")) {
		const separator = segment.indexOf("=");
		if (separator < 0 || segment.slice(0, separator).trim() !== name) continue;
		const value = segment.slice(separator + 1).trim();
		try { return decodeURIComponent(value) || null; } catch { return value || null; }
	}
	return null;
}

export async function requireAccountWorkspace(args: {
	request: Request;
	env: Env;
	workspaceId?: string | null;
}): Promise<AccountWorkspaceContext | null> {
	const user = await requireUser(args.request, args.env);
	const workspaceId = String(
		args.workspaceId ?? cookieValue(args.request, "activeWorkspaceId") ?? "",
	).trim();
	if (!user || !workspaceId) return null;
	const client = getDataClient(args.env);
	const userClient = getAuthenticatedDataClient(args.env, args.request);
	if (!userClient) return null;
	const [membershipResult, workspaceResult] = await Promise.all([
		client
			.from("workspace_members")
			.select("role")
			.eq("workspace_id", workspaceId)
			.eq("user_id", user.id)
			.maybeSingle(),
		client
			.from("workspaces")
			.select("owner_user_id,slug,name,logo_url")
			.eq("id", workspaceId)
			.maybeSingle(),
	]);
	if (membershipResult.error || workspaceResult.error) return null;
	const isOwner = workspaceResult.data?.owner_user_id === user.id;
	if (!membershipResult.data && !isOwner) return null;
	return {
		user,
		client,
		userClient,
		workspaceId,
		workspaceSlug: String(workspaceResult.data?.slug ?? workspaceId).trim().toLowerCase(),
		workspaceName: String(workspaceResult.data?.name ?? workspaceResult.data?.slug ?? workspaceId).trim(),
		workspaceLogoUrl: typeof workspaceResult.data?.logo_url === "string" ? workspaceResult.data.logo_url : null,
		role: isOwner ? "admin" : String(membershipResult.data?.role ?? "member"),
		isOwner,
	};
}
