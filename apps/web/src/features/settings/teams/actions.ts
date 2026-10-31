import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
import {
	normalizeTeamSsoSettingsInput,
	type TeamSsoMode,
	type TeamSsoSettingsInput,
	type TeamSsoSettingsRow,
} from "@/lib/auth/teamSsoSettings";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";

export type { TeamSsoMode, TeamSsoSettingsInput, TeamSsoSettingsRow };

export type WorkspaceScimSettings = {
	endpoint: { id: string; enabled: boolean; created_at: string; updated_at: string } | null;
	tokens: Array<{ id: string; token_prefix: string; label: string; created_at: string; expires_at: string | null; last_used_at: string | null; revoked_at: string | null }>;
	userCount: number;
	groupCount: number;
	lastEvent: { action: string; outcome: string; http_status: number; created_at: string } | null;
};

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

export const getTeamSsoSettingsAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((workspaceId: string) => workspaceId)
	.handler(async ({ data: workspaceId }) => {
		if (!workspaceId || typeof workspaceId !== "string") {
			throw new Error("Missing workspaceId");
		}

		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		return fetchAccountWebApi<TeamSsoSettingsRow>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/sso`, accessToken);
	});

export const updateTeamSsoSettingsAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { workspaceId: string; input: TeamSsoSettingsInput }) => input)
	.handler(async ({ data: { workspaceId, input } }) => {
		if (!workspaceId || typeof workspaceId !== "string") {
			throw new Error("Missing workspaceId");
		}

		const normalized = normalizeTeamSsoSettingsInput(input);
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		const response = await fetchAccountWebApi<{ success: true; workspaceId: string; settings: TeamSsoSettingsRow }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/sso`, accessToken, { method: "PUT", body: JSON.stringify(normalized) });

		return { ...response, settings: toTeamSsoSettingsResponse(response.settings) };
	});

export const getWorkspaceScimSettingsAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((workspaceId: string) => workspaceId)
	.handler(async ({ data: workspaceId }) => {
		if (!workspaceId) throw new Error("Missing workspaceId");
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		return fetchAccountWebApi<WorkspaceScimSettings>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/scim`, accessToken);
	});

export const updateWorkspaceScimSettingsAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { workspaceId: string; enabled: boolean }) => input)
	.handler(async ({ data: { workspaceId, enabled } }) => {
		if (!workspaceId) throw new Error("Missing workspaceId");
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		return fetchAccountWebApi<{ endpoint: WorkspaceScimSettings["endpoint"] }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/scim`, accessToken, { method: "PUT", body: JSON.stringify({ enabled }) });
	});

export const createWorkspaceScimTokenAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { workspaceId: string; label?: string }) => input)
	.handler(async ({ data: { workspaceId, label = "Provisioning token" } }) => {
		if (!workspaceId) throw new Error("Missing workspaceId");
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		return fetchAccountWebApi<{ id: string; token_prefix: string; label: string; created_at: string; expires_at: string | null; token: string }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/scim/tokens`, accessToken, { method: "POST", body: JSON.stringify({ label }) });
	});

export const revokeWorkspaceScimTokenAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { workspaceId: string; tokenId: string }) => input)
	.handler(async ({ data: { workspaceId, tokenId } }) => {
		if (!workspaceId || !tokenId) throw new Error("Missing SCIM token");
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		return fetchAccountWebApi<{ success: true }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}/scim/tokens/${encodeURIComponent(tokenId)}`, accessToken, { method: "DELETE" });
	});

export const createTeamAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { name: string; userId: string }) => input)
	.handler(async ({ data: { name, userId } }) => {
        const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	void userId;
    	const data = await fetchAccountWebApi<{ id: string }>("/api/account/settings/teams", accessToken, { method: "POST", body: JSON.stringify({ name }) });

    	return data;
    });

export const updateTeamAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { workspaceId: string; name: string }) => input)
	.handler(async ({ data: { workspaceId, name } }) => {
        if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");
        if (!name || typeof name !== "string") throw new Error("Missing name");

        const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	const data = await fetchAccountWebApi<{ id: string }>(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}`, accessToken, { method: "PUT", body: JSON.stringify({ name }) });

    	return data;
    });

export const updateWorkspacePublisherHandleAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { workspaceId: string; handle: string }) => input)
	.handler(async ({ data: { workspaceId, handle } }) => {
		if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");
		const { accessToken } = await getServerAccountContext();
		if (!accessToken) throw new Error("Unauthorized");
		const data = await fetchAccountWebApi<{ ok: true; handle: string }>("/api/account/settings/presets/publisher", accessToken, { method: "PUT", body: JSON.stringify({ workspaceId, handle }) });
		return data;
	});

export const deleteTeamAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((workspaceId: string) => workspaceId)
	.handler(async ({ data: workspaceId }) => {
        if (!workspaceId || typeof workspaceId !== "string") throw new Error("Missing workspaceId");

        const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	await fetchAccountWebApi(`/api/account/settings/teams/${encodeURIComponent(workspaceId)}`, accessToken, { method: "DELETE" });

        return { success: true } as const;
    });

export const createTeamInviteAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { workspaceId: string; creatorUserId: string; role: string; token: string; expiresInDays?: number; maxUses?: number | null }) => input)
	.handler(async ({ data: { workspaceId, creatorUserId, role, token, expiresInDays = 7, maxUses } }) => {
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
    });

export const revealTeamInviteAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((inviteId: string) => inviteId)
	.handler(async ({ data: inviteId }) => {
        if (!inviteId || typeof inviteId !== "string") throw new Error("Missing inviteId");

        const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	return fetchAccountWebApi<{ id: string; token: string }>(`/api/account/settings/teams/invites/${encodeURIComponent(inviteId)}/reveal`, accessToken);
    });

export const revokeTeamInviteAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((inviteId: string) => inviteId)
	.handler(async ({ data: inviteId }) => {
        if (!inviteId || typeof inviteId !== "string") throw new Error("Missing inviteId");

        const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	const data = await fetchAccountWebApi<{ success: true; id?: string }>(`/api/account/settings/teams/invites/${encodeURIComponent(inviteId)}`, accessToken, { method: "DELETE" });

    	return data;
    });

export const acceptTeamInviteAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((input: { token: string; userId: string }) => input)
	.handler(async ({ data: { token, userId } }) => {
        if (!token || token.length < 6) return { success: false as const, error: "Invite code too short" };
        if (!userId) return { success: false as const, error: "Please sign in" };

        const { accessToken } = await getServerAccountContext();
    	if (!accessToken) return { success: false as const, error: "Please sign in" };
    	try { return await fetchAccountWebApi<{ success: true; requestId: string }>("/api/account/settings/teams/invites/accept", accessToken, { method: "POST", body: JSON.stringify({ token, userId }) }); }
    	catch { return { success: false as const, error: "Could not create join request" }; }
    });

// ————————————————————————— TEAM JOIN REQUESTS —————————————————————————
export const approveJoinRequest = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((requestId: string) => requestId)
	.handler(async ({ data: requestId }) => {
        if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");
    	const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	const result = await fetchAccountWebApi<{ success: true; id: string; workspaceId: string }>(`/api/account/settings/teams/join-requests/${encodeURIComponent(requestId)}/approve`, accessToken, { method: "POST" });
    	return result;
    });

export const rejectJoinRequest = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((requestId: string) => requestId)
	.handler(async ({ data: requestId }) => {
        if (!requestId || typeof requestId !== "string") throw new Error("Missing requestId");
    	const { accessToken } = await getServerAccountContext();
    	if (!accessToken) throw new Error("Unauthorized");
    	const result = await fetchAccountWebApi<{ success: true; id: string; workspaceId: string }>(`/api/account/settings/teams/join-requests/${encodeURIComponent(requestId)}/reject`, accessToken, { method: "POST" });
    	return result;
    });
