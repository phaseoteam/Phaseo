"use server";

import { revalidatePath } from "next/cache";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import {
	THIRD_PARTY_OAUTH_COMING_SOON_MESSAGE,
	isThirdPartyOAuthEnabled,
} from "@/lib/oauth/thirdPartyOAuth";

interface CreateOAuthAppInput {
	name: string;
	description?: string;
	homepage_url?: string;
	redirect_uris: string[];
	workspace_id: string;
	logo_url?: string;
	privacy_policy_url?: string;
	terms_of_service_url?: string;
	allowed_scopes?: string[];
}

interface OAuthAppResult {
	data?: any;
	error?: string;
}

async function token(): Promise<string> {
	const { accessToken } = await getServerAccountContext();
	if (!accessToken) throw new Error("Unauthorized");
	return accessToken;
}

function refresh(clientId?: string): void {
	revalidatePath("/settings/oauth-apps");
	if (clientId) revalidatePath(`/settings/oauth-apps/${clientId}`);
}

async function execute<T>(operation: () => Promise<T>): Promise<OAuthAppResult> {
	try {
		return { data: await operation() };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "OAuth app operation failed" };
	}
}

function disabled(): OAuthAppResult | null {
	return isThirdPartyOAuthEnabled() ? null : { error: THIRD_PARTY_OAUTH_COMING_SOON_MESSAGE };
}

export async function createOAuthAppAction(input: CreateOAuthAppInput): Promise<OAuthAppResult> {
	const unavailable = disabled();
	if (unavailable) return unavailable;
	const result = await execute(async () => {
		const response = await fetchAccountWebApi<{ data: any }>(
			"/api/account/settings/oauth-apps",
			await token(),
			{ method: "POST", body: JSON.stringify(input) },
		);
		refresh();
		return response.data;
	});
	return result;
}

export async function updateOAuthAppAction(
	clientId: string,
	updates: {
		name?: string;
		description?: string;
		homepage_url?: string;
		logo_url?: string;
		privacy_policy_url?: string;
		terms_of_service_url?: string;
	},
): Promise<OAuthAppResult> {
	const unavailable = disabled();
	if (unavailable) return unavailable;
	return execute(async () => {
		const response = await fetchAccountWebApi<{ data: any }>(
			`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
			await token(),
			{ method: "PUT", body: JSON.stringify(updates) },
		);
		refresh(clientId);
		return response.data;
	});
}

export async function updateOAuthAppScopesAction(
	clientId: string,
	allowedScopes: string[],
): Promise<OAuthAppResult> {
	const unavailable = disabled();
	if (unavailable) return unavailable;
	const result = await execute(async () => {
		const response = await fetchAccountWebApi<{ data: any }>(
			`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
			await token(),
			{ method: "PUT", body: JSON.stringify({ allowed_scopes: allowedScopes }) },
		);
		refresh(clientId);
		revalidatePath("/settings/authorized-apps");
		return response.data;
	});
	return result;
}

export async function regenerateClientSecretAction(clientId: string): Promise<OAuthAppResult> {
	const unavailable = disabled();
	if (unavailable) return unavailable;
	return execute(async () => {
		const response = await fetchAccountWebApi<{ data: any }>(
			`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}/regenerate-secret`,
			await token(),
			{ method: "POST" },
		);
		refresh(clientId);
		return response.data;
	});
}

export async function deleteOAuthAppAction(clientId: string): Promise<OAuthAppResult> {
	const unavailable = disabled();
	if (unavailable) return unavailable;
	return execute(async () => {
		const response = await fetchAccountWebApi<{ data: any }>(
			`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
			await token(),
			{ method: "DELETE" },
		);
		refresh();
		return response.data;
	});
}

export async function listOAuthAppsAction(workspaceId: string): Promise<OAuthAppResult> {
	return execute(async () => {
		const response = await fetchAccountWebApi<{ oauthApps: any[] }>(
			`/api/account/settings/oauth-apps?workspaceId=${encodeURIComponent(workspaceId)}`,
			await token(),
		);
		return response.oauthApps;
	});
}

export async function updateRedirectUrisAction(
	clientId: string,
	redirectUris: string[],
): Promise<OAuthAppResult> {
	const unavailable = disabled();
	if (unavailable) return unavailable;
	return execute(async () => {
		const response = await fetchAccountWebApi<{ data: any }>(
			`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
			await token(),
			{ method: "PUT", body: JSON.stringify({ operation: "redirect-uris", redirect_uris: redirectUris }) },
		);
		refresh(clientId);
		return response.data;
	});
}
