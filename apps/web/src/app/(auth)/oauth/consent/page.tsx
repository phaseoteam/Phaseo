import React, { Suspense } from "react";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import ConsentForm from "@/components/(gateway)/oauth/ConsentForm";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

export const metadata = {
	title: "Authorize Application - AI Stats",
	description: "Authorize a third-party application to access your AI Stats account",
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

	// Validate required parameters
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
	const { data: oauthApp, error: appError } = await supabase
		.from("oauth_app_metadata")
		.select("*")
		.eq("client_id", params.client_id)
		.eq("status", "active")
		.single();

	if (appError || !oauthApp) {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>Application Not Found:</strong> The OAuth application could not be found
							or has been disabled.
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
	const registeredRedirectUris = parseRedirectUris((oauthApp as any).redirect_uris);
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

	// Fetch user's teams
	const { data: teamMembers, error: teamsError } = await supabase
		.from("team_members")
		.select(`
			team_id,
			teams:team_id (
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

	// Parse requested scopes
	const requestedScopes = params.scope
		? params.scope.split(" ").filter((s) => s.trim())
		: ["openid", "email", "gateway:access"];

	return (
		<div className="container max-w-2xl mx-auto py-12">
			<ConsentForm
				oauthApp={oauthApp}
				user={user}
				teams={teams}
				requestedScopes={requestedScopes}
				clientId={params.client_id}
				redirectUri={params.redirect_uri}
				state={params.state}
				codeChallenge={params.code_challenge}
				codeChallengeMethod={params.code_challenge_method}
			/>
		</div>
	);
}
