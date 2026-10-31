// OAuth consent reads the signed-in Supabase session and OAuth server state,
// so the whole request resolution runs on the server. The route loader turns
// the "sign-in" and "redirect" outcomes into redirects before rendering; the
// page renders every other outcome exactly as the Next page did.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

export type ConsentSearchParams = {
	authorization_id?: string;
	client_id?: string;
	redirect_uri?: string;
	scope?: string;
	state?: string;
	code_challenge?: string;
	code_challenge_method?: string;
	resource?: string;
	error?: string;
};

export type ConsentResolution =
	| { kind: "sign-in"; to: string }
	| { kind: "redirect"; to: string }
	| { kind: "unsafe-redirect" }
	| { kind: "error-param" }
	| { kind: "request-not-found" }
	| { kind: "missing-client-id" }
	| { kind: "application-not-found" }
	| { kind: "pkce-missing" }
	| { kind: "missing-redirect-uri" }
	| { kind: "redirect-uri-unregistered" }
	| { kind: "no-teams" }
	| {
			kind: "ok";
			oauthApp: any;
			user: any;
			teams: Array<{ id: string; name: string }>;
			requestedScopes: string[];
			authorizationId: string | null;
			resolvedClientId: string | undefined;
			resolvedRedirectUri: string | undefined;
	  };

const FIRST_PARTY_CLIENTS: Record<
	string,
	{
		name: string;
		homepage_url: string | null;
		logo_url: string | null;
	}
> = {
	phaseo_cli: {
		name: "Phaseo CLI",
		homepage_url: null,
		logo_url: null,
	},
};

function parseRedirectUris(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
	}
	if (typeof value === "string") {
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed.filter(
					(entry): entry is string => typeof entry === "string" && entry.length > 0
				);
			}
		} catch {
			return value.length > 0 ? [value] : [];
		}
	}
	return [];
}

function oauthAppFromClientRow(row: Record<string, any>) {
	return {
		client_id: row.client_id ?? row.id ?? null,
		name: row.name ?? "OAuth Application",
		description: row.description ?? null,
		homepage_url: row.homepage_url ?? null,
		logo_url: row.logo_url ?? null,
		redirect_uris: parseRedirectUris(row.redirect_uris),
		status: row.status ?? "active",
		is_first_party: Boolean(row.is_first_party),
		registration_source: row.registration_source ?? (row.is_first_party ? "first_party" : "dynamic"),
	};
}

async function loadConsentClientMetadata(supabase: any, clientId: string, apiBaseUrl: () => string) {
	const { data: { session } } = await supabase.auth.getSession();
	if (!session?.access_token) return null;
	try {
		const url = new URL(`${apiBaseUrl()}/oauth/client-metadata`);
		url.searchParams.set("client_id", clientId);
		const response = await fetch(url, {
			headers: { Authorization: `Bearer ${session.access_token}` },
			cache: "no-store",
		});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

export const resolveOAuthConsent = createServerFn({ method: "GET" })
	.validator((params: ConsentSearchParams) => params)
	.handler(async ({ data: params }): Promise<ConsentResolution> => {
		const [{ createClient }, { isSafeOAuthRedirectUrl }, { apiBaseUrl }, { isRegisteredOAuthRedirectAllowed }, { getTranslations }] = await Promise.all([
			import("@/utils/supabase/server"),
			import("@/lib/oauth/safeUrls"),
			import("@/lib/oauth/apiBaseUrl"),
			import("@/lib/oauth/registeredRedirect"),
			import("@/i18n/server"),
		]);
		const supabase = await createClient();
		const oauthClient = supabase.auth.oauth as any;

		// Check if user is authenticated
		const {
			data: { user },
			error: userError,
		} = await supabase.auth.getUser();

		// If not authenticated, redirect to sign in with return URL
		if (userError || !user) {
			const returnUrl = new URLSearchParams(params as any).toString();
			return { kind: "sign-in", to: `/sign-in?returnUrl=${encodeURIComponent(`/oauth/consent?${returnUrl}`)}` };
		}

		// Handle error cases
		if (params.error) return { kind: "error-param" };

		const authorizationId =
			typeof params.authorization_id === "string" &&
			params.authorization_id.trim().length > 0
				? params.authorization_id.trim()
				: null;

		let oauthApp: any = null;
		let resolvedClientId: string | undefined;
		let resolvedRedirectUri: string | undefined;
		let requestedScopes: string[] = [];

		if (authorizationId) {
			const { data: authorizationDetails, error: authorizationError } =
				await oauthClient.getAuthorizationDetails(authorizationId);

			if (authorizationError || !authorizationDetails) return { kind: "request-not-found" };

			if ("redirect_url" in authorizationDetails && authorizationDetails.redirect_url) {
				if (isSafeOAuthRedirectUrl(authorizationDetails.redirect_url)) {
					return { kind: "redirect", to: authorizationDetails.redirect_url };
				}
				return { kind: "unsafe-redirect" };
			}

			// Authorization details come from the OAuth server and are authoritative.
			// Never let query parameters replace the client identity used for branding.
			resolvedClientId = typeof authorizationDetails.client?.id === "string"
				? authorizationDetails.client.id
				: undefined;
			resolvedRedirectUri = authorizationDetails.redirect_uri;
			requestedScopes = authorizationDetails.scope
				.split(" ")
				.map((scope: string) => scope.trim())
				.filter((scope: string) => scope.length > 0);
			if (requestedScopes.length === 0) {
				requestedScopes = ["openid", "email", "gateway:access"];
			}

			if (resolvedClientId) {
				const { data: appMetadata } = await supabase
					.from("oauth_app_metadata")
					.select("*")
					.eq("client_id", resolvedClientId)
					.eq("status", "active")
					.maybeSingle();
				oauthApp = appMetadata
					? { ...appMetadata, registration_source: appMetadata.is_first_party ? "first_party" : "developer" }
					: await loadConsentClientMetadata(supabase, resolvedClientId, apiBaseUrl);
			}

			if (!oauthApp) {
				oauthApp = {
					client_id: resolvedClientId ?? authorizationDetails.client?.id ?? null,
					name: authorizationDetails.client?.name ?? "OAuth Application",
					description: null,
					homepage_url: authorizationDetails.client?.uri ?? null,
					logo_url: authorizationDetails.client?.logo_uri ?? null,
					redirect_uris: [authorizationDetails.redirect_uri],
					status: "active",
					is_first_party: false,
					registration_source: "dynamic",
				};
			}
		} else {
			// Legacy direct-parameter fallback
			if (!params.client_id) return { kind: "missing-client-id" };

			// Fetch OAuth app metadata
			const { data: appMetadata, error: appError } = await supabase
				.from("oauth_app_metadata")
				.select("*")
				.eq("client_id", params.client_id)
				.eq("status", "active")
				.single();

			let resolvedAppMetadata: Record<string, any> | null = appMetadata as Record<string, any> | null;
			if (appError || !resolvedAppMetadata) {
				const firstPartyClient = await loadConsentClientMetadata(supabase, params.client_id, apiBaseUrl);
				if (firstPartyClient) {
					resolvedAppMetadata = oauthAppFromClientRow(firstPartyClient as Record<string, any>);
				}
			}
			if (!resolvedAppMetadata && params.client_id in FIRST_PARTY_CLIENTS) {
				const t = await getTranslations("Common.authFlows.oauthConsent");
				const firstPartyClient = FIRST_PARTY_CLIENTS[params.client_id];
				const redirectUris =
					typeof params.redirect_uri === "string" && params.redirect_uri.trim().length > 0
						? [params.redirect_uri]
						: [];
				resolvedAppMetadata = {
					client_id: params.client_id,
					name: firstPartyClient.name,
					description: t("firstPartyDescription"),
					homepage_url: firstPartyClient.homepage_url,
					logo_url: firstPartyClient.logo_url,
					redirect_uris: redirectUris,
					status: "active",
					is_first_party: true,
					registration_source: "first_party",
				};
			}

			if (!resolvedAppMetadata) return { kind: "application-not-found" };

			// Verify PKCE is present (OAuth 2.1 requirement)
			if (!params.code_challenge || !params.code_challenge_method) return { kind: "pkce-missing" };

			if (!params.redirect_uri) return { kind: "missing-redirect-uri" };
			const registeredRedirectUris = parseRedirectUris(resolvedAppMetadata.redirect_uris);
			if (
				(registeredRedirectUris.length > 0 || params.client_id === "phaseo_desktop") &&
				!isRegisteredOAuthRedirectAllowed({ client_id: params.client_id, redirect_uris: registeredRedirectUris, is_first_party: resolvedAppMetadata.is_first_party, registration_source: resolvedAppMetadata.registration_source }, params.redirect_uri)
			) {
				return { kind: "redirect-uri-unregistered" };
			}

			oauthApp = resolvedAppMetadata;
			resolvedClientId = params.client_id;
			resolvedRedirectUri = params.redirect_uri;
			requestedScopes = params.scope
				? params.scope.split(" ").filter((s) => s.trim())
				: ["openid", "email", "gateway:access"];
		}

		// Fetch user's teams
		const { data: teamMembers, error: teamsError } = await supabase
			.from("workspace_members")
			.select(`
				workspace_id,
				teams:workspaces (
					id,
					name
				)
			`)
			.eq("user_id", user.id);

		if (teamsError || !teamMembers || teamMembers.length === 0) return { kind: "no-teams" };

		// Transform teams data
		const teams = teamMembers
			.map((tm) => {
				const team = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
				if (team && typeof team === "object" && "id" in team && "name" in team) {
					return { id: team.id as string, name: team.name as string };
				}
				return null;
			})
			.filter((t): t is { id: string; name: string } => t !== null);

		return {
			kind: "ok",
			oauthApp,
			user: JSON.parse(JSON.stringify(user)),
			teams,
			requestedScopes,
			authorizationId,
			resolvedClientId,
			resolvedRedirectUri,
		};
	});

/** String search params, as Next passed them (the sign-in return URL keeps them all). */
export function toConsentSearchParams(search: Record<string, unknown>): ConsentSearchParams {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(search)) {
		if (typeof value === "string") out[key] = value;
	}
	return out as ConsentSearchParams;
}

export const oauthConsentQuery = (params: ConsentSearchParams) =>
	queryOptions({
		queryKey: ["oauth-consent", params],
		queryFn: () => resolveOAuthConsent({ data: params }),
		// Resolve once per visit: a background refetch must not re-run the OAuth lookup.
		staleTime: Infinity,
	});
