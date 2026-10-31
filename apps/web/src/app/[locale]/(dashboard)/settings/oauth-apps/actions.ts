import { createServerFn } from "@tanstack/react-start";
import { serverAction, serverMutation } from "@/lib/serverFn/actionMiddleware";
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

export const createOAuthAppAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: CreateOAuthAppInput) => input)
	.handler(async ({ data: input }): Promise<OAuthAppResult> => {
		const unavailable = disabled();
		if (unavailable) return unavailable;
		const result = await execute(async () => {
			const response = await fetchAccountWebApi<{ data: any }>(
				"/api/account/settings/oauth-apps",
				await token(),
				{ method: "POST", body: JSON.stringify(input) },
			);
			return response.data;
		});
		return result;
	});

export const updateOAuthAppAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { clientId: string; updates: {
			name?: string;
			description?: string;
			homepage_url?: string;
			logo_url?: string;
			privacy_policy_url?: string;
			terms_of_service_url?: string;
		} }) => input)
	.handler(async ({ data: { clientId, updates } }): Promise<OAuthAppResult> => {
		const unavailable = disabled();
		if (unavailable) return unavailable;
		return execute(async () => {
			const response = await fetchAccountWebApi<{ data: any }>(
				`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
				await token(),
				{ method: "PUT", body: JSON.stringify(updates) },
			);
			return response.data;
		});
	});

export const updateOAuthAppScopesAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { clientId: string; allowedScopes: string[] }) => input)
	.handler(async ({ data: { clientId, allowedScopes } }): Promise<OAuthAppResult> => {
		const unavailable = disabled();
		if (unavailable) return unavailable;
		const result = await execute(async () => {
			const response = await fetchAccountWebApi<{ data: any }>(
				`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
				await token(),
				{ method: "PUT", body: JSON.stringify({ allowed_scopes: allowedScopes }) },
			);
			return response.data;
		});
		return result;
	});

export const regenerateClientSecretAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((clientId: string) => clientId)
	.handler(async ({ data: clientId }): Promise<OAuthAppResult> => {
		const unavailable = disabled();
		if (unavailable) return unavailable;
		return execute(async () => {
			const response = await fetchAccountWebApi<{ data: any }>(
				`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}/regenerate-secret`,
				await token(),
				{ method: "POST" },
			);
			return response.data;
		});
	});

export const deleteOAuthAppAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((clientId: string) => clientId)
	.handler(async ({ data: clientId }): Promise<OAuthAppResult> => {
		const unavailable = disabled();
		if (unavailable) return unavailable;
		return execute(async () => {
			const response = await fetchAccountWebApi<{ data: any }>(
				`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
				await token(),
				{ method: "DELETE" },
			);
			return response.data;
		});
	});

export const listOAuthAppsAction = createServerFn({ method: "POST" })
	.middleware([serverAction])
	.validator((workspaceId: string) => workspaceId)
	.handler(async ({ data: workspaceId }): Promise<OAuthAppResult> => {
		return execute(async () => {
			const response = await fetchAccountWebApi<{ oauthApps: any[] }>(
				`/api/account/settings/oauth-apps?workspaceId=${encodeURIComponent(workspaceId)}`,
				await token(),
			);
			return response.oauthApps;
		});
	});

export const updateRedirectUrisAction = createServerFn({ method: "POST" })
	.middleware([serverMutation])
	.validator((input: { clientId: string; redirectUris: string[] }) => input)
	.handler(async ({ data: { clientId, redirectUris } }): Promise<OAuthAppResult> => {
		const unavailable = disabled();
		if (unavailable) return unavailable;
		return execute(async () => {
			const response = await fetchAccountWebApi<{ data: any }>(
				`/api/account/settings/oauth-apps/${encodeURIComponent(clientId)}`,
				await token(),
				{ method: "PUT", body: JSON.stringify({ operation: "redirect-uris", redirect_uris: redirectUris }) },
			);
			return response.data;
		});
	});
