import React, { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { redirect } from "@/lib/navigation";
import ConsentForm from "@/components/(gateway)/oauth/ConsentForm";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { oauthConsentQuery, toConsentSearchParams } from "./page.functions";

export async function getOAuthConsentMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Common.authFlows.oauthConsent");
	return { title: t("metaTitle"), description: t("metaDescription") };
}

type ConsentSearch = {
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

export function OAuthConsentPage() {
	const t = useTranslations("Common.authFlows.oauthConsent");
	return (
		<Suspense
			fallback={
				<div className="container max-w-2xl mx-auto py-12">
					<Card className="p-8">
						<div className="text-center text-muted-foreground">
							{t("loading")}
						</div>
					</Card>
				</div>
			}
		>
			<ConsentPageContent />
		</Suspense>
	);
}

// The request is resolved on the server (page.functions.ts). Signed-out
// visitors and already-approved requests are redirected by the route loader
// before rendering; the redirect calls below only cover client re-renders.
function ConsentPageContent() {
	const t = useTranslations("Common.authFlows.oauthConsent");
	const params = useSearch({ from: "/{-$locale}/_auth/oauth/consent/" }) as ConsentSearch;
	const { data: resolution } = useSuspenseQuery(oauthConsentQuery(toConsentSearchParams(params)));

	if (resolution.kind === "sign-in" || resolution.kind === "redirect") {
		redirect(resolution.to);
	}

	// Handle error cases
	if (resolution.kind === "error-param") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("authorizationError")}:</strong> {params.error}
						</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground mt-4">
						{t("requestCouldNotProcess")}
					</p>
				</Card>
			</div>
		);
	}

	if (resolution.kind === "request-not-found") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("authorizationError")}:</strong>{" "}
							{t("requestNotFound")}
						</AlertDescription>
					</Alert>
				</Card>
			</div>
		);
	}

	if (resolution.kind === "unsafe-redirect") {
		throw new Error("Authorization server returned an unsafe redirect URL");
	}

	if (resolution.kind === "missing-client-id") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("invalidRequest")}:</strong> {t("missingClientId")}
						</AlertDescription>
					</Alert>
				</Card>
			</div>
		);
	}

	if (resolution.kind === "application-not-found") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("applicationNotFound")}:</strong> {t("applicationDisabled")}
						</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground mt-4">
						{t("clientId")}: <code className="text-xs">{params.client_id}</code>
					</p>
				</Card>
			</div>
		);
	}

	// Verify PKCE is present (OAuth 2.1 requirement)
	if (resolution.kind === "pkce-missing") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("invalidRequest")}:</strong> {t("pkceMissing")}
						</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground mt-4">
						{t("pkceDescription")}
					</p>
				</Card>
			</div>
		);
	}

	if (resolution.kind === "missing-redirect-uri") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("invalidRequest")}:</strong> {t("missingRedirectUri")}
						</AlertDescription>
					</Alert>
				</Card>
			</div>
		);
	}

	if (resolution.kind === "redirect-uri-unregistered") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
							<strong>{t("invalidRequest")}:</strong> {t("redirectUriUnregistered")}
						</AlertDescription>
					</Alert>
				</Card>
			</div>
		);
	}

	if (resolution.kind === "no-teams") {
		return (
			<div className="container max-w-2xl mx-auto py-12">
				<Card className="p-8">
					<Alert variant="destructive">
						<AlertTriangle className="h-4 w-4" />
						<AlertDescription>
								<strong>{t("noTeamsFound")}:</strong> {t("teamsMembershipRequired")}
						</AlertDescription>
					</Alert>
					<p className="text-sm text-muted-foreground mt-4">
							{t("createTeamFirst")}
					</p>
				</Card>
			</div>
		);
	}

	const { oauthApp, user, teams, requestedScopes, authorizationId, resolvedClientId, resolvedRedirectUri } = resolution;

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
				resource={params.resource}
			/>
		</div>
	);
}
