import React, { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ConsentForm from "@/components/(gateway)/oauth/ConsentForm";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export const metadata = {
	title: "Authorize Application - AI Stats",
	description:
		"Authorize a third-party application to access your AI Stats account, choose permitted team scopes, and review exactly what the integration can read or modify before approval.",
};

interface ConsentPageProps {
	searchParams: Promise<{
		authorization_id?: string;
		client_id?: string;
		redirect_uri?: string;
		scope?: string;
		state?: string;
		code_challenge?: string;
		code_challenge_method?: string;
		error?: string;
	}>;
}

const FIRST_PARTY_CLIENTS: Record<
	string,
	{
		name: string;
		description: string;
		homepage_url: string | null;
		logo_url: string | null;
	}
> = {
	aistats_cli: {
		name: "AI Stats CLI",
		description:
			"Official first-party AI Stats command line interface for signing in, managing workspaces, and creating keys.",
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
	};
}

export default function ConsentPage({ searchParams }: ConsentPageProps) {
	return (
		<Suspense
			fallback={
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<div className="text-center text-muted-foreground">
							Loading authorization request...
						</div>
					</Card>
				</div>
			}
		>
			<ConsentPageContent searchParams={searchParams} />
		</Suspense>
	);
}

async function ConsentPageContent({ searchParams }: ConsentPageProps) {
	const params = await searchParams;
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
		redirect(`/sign-in?returnUrl=${encodeURIComponent(`/oauth/consent?${returnUrl}`)}`);
	}

	// Handle error cases
	if (params.error) {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>Authorization Error:</strong> {params.error}
						</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground mt-4">
						The authorization request could not be processed. Please try again or contact
						the application developer.
					</p>
				</Card>
			</div>
		);
	}

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

		if (authorizationError || !authorizationDetails) {
			return (
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Authorization Error:</strong>{" "}
								{authorizationError?.message ||
									"The authorization request was not found or has expired."}
							</AlertDescription>
						</Alert>
					</Card>
				</div>
			);
		}

		if ("redirect_url" in authorizationDetails && authorizationDetails.redirect_url) {
			redirect(authorizationDetails.redirect_url);
		}

		resolvedClientId =
			(typeof params.client_id === "string" && params.client_id.trim()) ||
			(typeof authorizationDetails.client?.id === "string"
				? authorizationDetails.client.id
				: undefined);
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
			oauthApp = appMetadata;
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
			};
		}
	} else {
		// Legacy direct-parameter fallback
		if (!params.client_id) {
			return (
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Invalid Request:</strong> Missing client_id parameter
							</AlertDescription>
						</Alert>
					</Card>
				</div>
			);
		}

		// Fetch OAuth app metadata
		const { data: appMetadata, error: appError } = await supabase
			.from("oauth_app_metadata")
			.select("*")
			.eq("client_id", params.client_id)
			.eq("status", "active")
			.single();

		let resolvedAppMetadata: Record<string, any> | null = appMetadata as Record<string, any> | null;
		if (appError || !resolvedAppMetadata) {
			const { data: firstPartyClient } = await supabase
				.from("oauth_clients")
				.select("id, name, description, logo_url, homepage_url, redirect_uris, status")
				.eq("id", params.client_id)
				.eq("status", "active")
				.maybeSingle();
			if (firstPartyClient) {
				resolvedAppMetadata = oauthAppFromClientRow(firstPartyClient as Record<string, any>);
			}
		}
		if (!resolvedAppMetadata && params.client_id in FIRST_PARTY_CLIENTS) {
			const firstPartyClient = FIRST_PARTY_CLIENTS[params.client_id];
			const redirectUris =
				typeof params.redirect_uri === "string" && params.redirect_uri.trim().length > 0
					? [params.redirect_uri]
					: [];
			resolvedAppMetadata = {
				client_id: params.client_id,
				name: firstPartyClient.name,
				description: firstPartyClient.description,
				homepage_url: firstPartyClient.homepage_url,
				logo_url: firstPartyClient.logo_url,
				redirect_uris: redirectUris,
				status: "active",
			};
		}

		if (!resolvedAppMetadata) {
			return (
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Application Not Found:</strong> The OAuth application could not be
								found or has been disabled.
							</AlertDescription>
						</Alert>
						<p className="text-sm text-muted-foreground mt-4">
							Client ID: <code className="text-xs">{params.client_id}</code>
						</p>
					</Card>
				</div>
			);
		}

		// Verify PKCE is present (OAuth 2.1 requirement)
		if (!params.code_challenge || !params.code_challenge_method) {
			return (
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Invalid Request:</strong> PKCE is required (missing code_challenge)
							</AlertDescription>
						</Alert>
						<p className="text-sm text-muted-foreground mt-4">
							OAuth 2.1 requires PKCE for all authorization flows. Please update your
							client implementation.
						</p>
					</Card>
				</div>
			);
		}

		if (!params.redirect_uri) {
			return (
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Invalid Request:</strong> Missing redirect_uri parameter
							</AlertDescription>
						</Alert>
					</Card>
				</div>
			);
		}
		const registeredRedirectUris = parseRedirectUris(resolvedAppMetadata.redirect_uris);
		if (
			registeredRedirectUris.length > 0 &&
			!registeredRedirectUris.includes(params.redirect_uri)
		) {
			return (
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertDescription>
								<strong>Invalid Request:</strong> redirect_uri is not registered for this
								application
							</AlertDescription>
						</Alert>
					</Card>
				</div>
			);
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

	if (teamsError || !teamMembers || teamMembers.length === 0) {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>No Teams Found:</strong> You need to be a member of at least one team
							to authorize applications.
						</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground mt-4">
						Please create a team first, then try again.
					</p>
				</Card>
			</div>
		);
	}

	// Transform teams data
	const teams = teamMembers
		.map((tm) => {
			const team = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
			if (team && typeof team === "object" && "id" in team && "name" in team) {
				return { id: team.id, name: team.name };
			}
			return null;
		})
		.filter((t): t is { id: string; name: string } => t !== null);

	return (
		<div className="container max-w-3xl mx-auto py-12">
			<ConsentForm
				oauthApp={oauthApp}
				user={user}
				teams={teams}
				requestedScopes={requestedScopes}
				authorizationId={authorizationId ?? undefined}
				clientId={resolvedClientId}
				redirectUri={resolvedRedirectUri}
				state={params.state}
				codeChallenge={params.code_challenge}
				codeChallengeMethod={params.code_challenge_method}
			/>
		</div>
	);
}
