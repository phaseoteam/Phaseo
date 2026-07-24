"use server";

import { revalidatePath } from "next/cache";
import {
	normalizeTeamSsoSettingsInput,
	type TeamSsoMode,
	type TeamSsoSettingsInput,
	type TeamSsoSettingsRow,
} from "@/lib/auth/teamSsoSettings";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export type { TeamSsoMode, TeamSsoSettingsInput, TeamSsoSettingsRow };

function toTeamSsoSettingsResponse(
	row: TeamSsoSettingsRow | null | undefined,
): TeamSsoSettingsRow {
	return {
		sso_enabled: Boolean(row?.sso_enabled),
		sso_enforced: Boolean(row?.sso_enforced),
		sso_mode: String(row?.sso_mode ?? "none"),
		sso_provider_identifier: row?.sso_provider_identifier ?? null,
		sso_domains: Array.isArray(row?.sso_domains) ? row!.sso_domains : [],
	};
}

function revalidateWorkspacePaths() {
	revalidatePath("/settings/teams");
	revalidatePath("/settings/workspaces");
	revalidatePath("/settings/workspaces/members");
	revalidatePath("/settings/workspaces/settings");
}

export async function getTeamSsoSettingsAction(workspaceId: string) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Missing workspaceId");
	}

	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return fetchAccountWebApi<TeamSsoSettingsRow>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/sso`, accessToken);
}

export async function updateTeamSsoSettingsAction(
	workspaceId: string,
	input: TeamSsoSettingsInput,
) {
	if (!workspaceId || typeof workspaceId !== "string") {
		throw new Error("Missing workspaceId");
	}

	const normalized = normalizeTeamSsoSettingsInput(input);
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const response = await fetchAccountWebApi<{ success: true; workspaceId: string; settings: TeamSsoSettingsRow }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/sso`, accessToken, { method: "PUT", body: JSON.stringify(normalized) });

	revalidateWorkspacePaths();
	return { ...response, settings: toTeamSsoSettingsResponse(response.settings) };
}

export async function createTeamAction(name: string, userId: string) {
    const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	void userId;
	const data = await fetchAccountWebApi<{ id: string }>("/api/account/settings/teams", accessToken, { method: "POST", body: JSON.stringify({ name }) });

    revalidateWorkspacePaths();
	return data;
}

export async function updateTeamAction(workspaceId: string, name: string) {
    if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");
    if (!name || typeof name !== "string") throw new Error("Missing name");

    const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const data = await fetchAccountWebApi<{ id: string }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}`, accessToken, { method: "PUT", body: JSON.stringify({ name }) });

    revalidateWorkspacePaths();
	return data;
}

export async function deleteTeamAction(workspaceId: string) {
    if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");

    const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	await fetchAccountWebApi(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}`, accessToken, { method: "DELETE" });

    revalidateWorkspacePaths();
    return { success: true } as const;
}

export async function createTeamInviteAction(
    workspaceId: string,
    creatorUserId: string,
    role: string,
    token: string,
    expiresInDays = 7,
    maxUses?: number | null,
) {
    if (!workspaceId) throw new Error("Missing workspaceId");
    if (!creatorUserId) throw new Error("Missing creatorUserId");
    if (!token || token.length < 6) throw new Error("Invalid token");

    const normalizedRole = String(role || "member").toLowerCase();
    if (!["admin", "member"].includes(normalizedRole)) {
        throw new Error("Invalid role");
    }

    const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return fetchAccountWebApi<{ id?: string; token: string }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/invites`, accessToken, { method: "POST", body: JSON.stringify({ creatorUserId, role: normalizedRole, token, expiresInDays, maxUses }) });
}

export async function revealTeamInviteAction(inviteId: string) {
    if (!inviteId || typeof inviteId !== "string") throw new Error("Missing inviteId");

    const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return fetchAccountWebApi<{ id: string; token: string }>(`/api/account/settings/teams/invites/${encodeURIComponent(inviteId)}/reveal`, accessToken);
}

export async function revokeTeamInviteAction(inviteId: string) {
    if (!inviteId || typeof inviteId !== "string") throw new Error("Missing inviteId");

    const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const data = await fetchAccountWebApi<{ success: true; id?: string }>(`/api/account/settings/teams/invites/${encodeURIComponent(inviteId)}`, accessToken, { method: "DELETE" });

    revalidateWorkspacePaths();
	return data;
}

export async function acceptTeamInviteAction(token: string, userId: string) {
    if (!token || token.length < 6) return { success: false as const, error: "Invite code too short" };
    if (!userId) return { success: false as const, error: "Please sign in" };

    const { accessToken } = await getServerAccountContext();
	if (!accessToken) return { success: false as const, error: "Please sign in" };
	try { return await fetchAccountWebApi<{ success: true; requestId: string }>("/api/account/settings/teams/invites/accept", accessToken, { method: "POST", body: JSON.stringify({ token, userId }) }); }
	catch { return { success: false as const, error: "Could not create join request" }; }
}

// ————————————————————————— TEAM JOIN REQUESTS —————————————————————————
export async function approveJoinRequest(requestId: string) {
    if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const result = await fetchAccountWebApi<{ success: true; id: string; workspaceId: string }>(`/api/account/settings/teams/join-requests/${encodeURIComponent(requestId)}/approve`, accessToken, { method: "POST" });
    revalidateWorkspacePaths();
	return result;
}

export async function rejectJoinRequest(requestId: string) {
    if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	const result = await fetchAccountWebApi<{ success: true; id: string; workspaceId: string }>(`/api/account/settings/teams/join-requests/${encodeURIComponent(requestId)}/reject`, accessToken, { method: "POST" });
    revalidateWorkspacePaths();
	return result;
}
