"use server";

import { revalidatePath } from "next/cache";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

function revalidateWorkspacePaths() {
	revalidatePath("/settings/teams");
	revalidatePath("/settings/workspaces");
	revalidatePath("/settings/workspaces/members");
	revalidatePath("/settings/workspaces/settings");
}

async function contextToken() {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Not authenticated");
	return accessToken;
}

export async function updateMemberRole(workspaceId: string, userId: string, newRole?: string) {
	if (!workspaceId || !userId) throw new Error("Missing workspaceId or userId");
	const role = String(newRole ?? "").toLowerCase();
	if (role !== "admin" && role !== "member") throw new Error("Invalid role. Allowed roles are admin and member.");
	const result = await fetchAccountWebApi<{ workspaceId: string; userId: string; role: string | null; ok: true }>(
		`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
		await contextToken(),
		{ method: "PUT", body: JSON.stringify({ role }) },
	);
	revalidateWorkspacePaths();
	return result;
}

export async function removeMember(workspaceId: string, userId: string) {
	if (!workspaceId || !userId) throw new Error("Missing workspaceId or userId");
	const result = await fetchAccountWebApi<{ workspaceId: string; userId: string; ok: boolean; message?: string }>(
		`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
		await contextToken(),
		{ method: "DELETE" },
	);
	revalidateWorkspacePaths();
	return result;
}
