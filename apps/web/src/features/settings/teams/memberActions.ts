import { createServerFn } from "@tanstack/react-start";
import { serverMutation } from "@/lib/serverFn/actionMiddleware";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

async function contextToken() {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Not authenticated");
	return accessToken;
}

export const updateMemberRole = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { workspaceId: string; userId: string; newRole?: string }) => input)
	.handler(async ({ data: { workspaceId, userId, newRole } }) => {
		if (!workspaceId || !userId) throw new Error("Missing workspaceId or userId");
		const role = String(newRole ?? "").toLowerCase();
		if (role !== "admin" && role !== "member") throw new Error("Invalid role. Allowed roles are admin and member.");
		const result = await fetchAccountWebApi<{ workspaceId: string; userId: string; role: string | null; ok: true }>(
			`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
			await contextToken(),
			{ method: "PUT", body: JSON.stringify({ role }) },
		);
		return result;
	});

export const removeMember = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { workspaceId: string; userId: string }) => input)
	.handler(async ({ data: { workspaceId, userId } }) => {
		if (!workspaceId || !userId) throw new Error("Missing workspaceId or userId");
		const result = await fetchAccountWebApi<{ workspaceId: string; userId: string; ok: boolean; message?: string }>(
			`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
			await contextToken(),
			{ method: "DELETE" },
		);
		return result;
	});
