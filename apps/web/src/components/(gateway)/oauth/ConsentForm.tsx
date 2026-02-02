"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, ExternalLink, Shield, Lock } from "lucide-react";

interface ConsentFormProps {
	oauthApp: any;
	user: any;
	teams: Array<{ id: string; name: string }>;
	requestedScopes: string[];
	clientId: string;
	redirectUri: string;
	state?: string;
	codeChallenge: string;
	codeChallengeMethod: string;
}

// Scope descriptions for user-friendly display
const SCOPE_DESCRIPTIONS: Record<string, { label: string; description: string; icon: any }> = {
	openid: {
		label: "Identity",
		description: "Verify your identity",
		icon: Shield,
	},
	email: {
		label: "Email Address",
		description: "Access your email address",
		icon: Shield,
	},
	profile: {
		label: "Profile",
		description: "Access your basic profile information",
		icon: Shield,
	},
	"gateway:access": {
		label: "API Gateway Access",
		description: "Make requests to the AI Stats API gateway on your behalf",
		icon: Lock,
	},
};

export default function ConsentForm({
	oauthApp,
	user,
	teams,
	requestedScopes,
	clientId,
	redirectUri,
	state,
	codeChallenge,
	codeChallengeMethod,
}: ConsentFormProps) {
	const [selectedTeamId, setSelectedTeamId] = useState<string>(
		teams.length === 1 ? teams[0].id : ""
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleApprove = async () => {
		if (!selectedTeamId) {
			setError("Please select a team to authorize");
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const { approveAuthorizationAction } = await import(
				"@/app/(auth)/oauth/consent/actions"
			);

			const result = await approveAuthorizationAction({
				client_id: clientId,
				team_id: selectedTeamId,
				scopes: requestedScopes,
				redirect_uri: redirectUri,
				state: state,
				code_challenge: codeChallenge,
				code_challenge_method: codeChallengeMethod,
			});

			if (result.error) {
				setError(result.error);
				return;
			}

			// Redirect to the redirect_uri with authorization code
			if (result.data?.redirect_url) {
				window.location.href = result.data.redirect_url;
			}
		} catch (err: any) {
			setError(err.message || "Failed to authorize application");
		} finally {
			setLoading(false);
		}
	};

	const handleDeny = async () => {
		setLoading(true);
		setError(null);

		try {
			const { denyAuthorizationAction } = await import(
				"@/app/(auth)/oauth/consent/actions"
			);

			const result = await denyAuthorizationAction({
				redirect_uri: redirectUri,
				state: state,
			});

			if (result.data?.redirect_url) {
				window.location.href = result.data.redirect_url;
			}
		} catch (err: any) {
			setError(err.message || "Failed to deny authorization");
		} finally {
			setLoading(false);
		}
	};

	return (
		<Card className="shadow-lg">
			<CardHeader className="space-y-4">
				{/* Alpha Badge */}
				<div className="flex justify-end">
					<Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700">
						OAuth Alpha
					</Badge>
				</div>

				<div className="flex items-start gap-4">
					{oauthApp.logo_url ? (
						<img
							src={oauthApp.logo_url}
							alt={oauthApp.name}
							className="size-16 rounded-md object-cover border"
						/>
					) : (
						<div className="size-16 rounded-md border bg-muted flex items-center justify-center">
							<Shield className="size-8 text-muted-foreground" />
						</div>
					)}
					<div className="flex-1">
						<CardTitle className="text-2xl">{oauthApp.name}</CardTitle>
						<CardDescription className="mt-1">
							wants to access your AI Stats account
						</CardDescription>
						{oauthApp.homepage_url && (
							<a
								href={oauthApp.homepage_url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-2"
							>
								<ExternalLink className="size-3" />
								<span>{new URL(oauthApp.homepage_url).hostname}</span>
							</a>
						)}
					</div>
				</div>

				{oauthApp.description && (
					<p className="text-sm text-muted-foreground">
						{oauthApp.description}
					</p>
				)}
			</CardHeader>

			<CardContent className="space-y-6">
				{/* Security Notice */}
				<Alert>
					<Shield className="h-4 w-4" />
					<AlertDescription>
						This application will be able to access your account on your behalf.
						Only authorize applications you trust.
					</AlertDescription>
				</Alert>

				{/* Team Selection */}
				<div className="space-y-2">
					<Label htmlFor="team">Select Team</Label>
					<Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
						<SelectTrigger id="team">
							<SelectValue placeholder="Choose which team to authorize..." />
						</SelectTrigger>
						<SelectContent>
							{teams.map((team) => (
								<SelectItem key={team.id} value={team.id}>
									{team.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<p className="text-xs text-muted-foreground">
						The application will access resources for this team
					</p>
				</div>

				{/* Requested Permissions */}
				<div className="space-y-3">
					<Label>Requested Permissions</Label>
					<div className="space-y-2">
						{requestedScopes.map((scope) => {
							const scopeInfo = SCOPE_DESCRIPTIONS[scope] || {
								label: scope,
								description: `Access to ${scope}`,
								icon: Shield,
							};
							const Icon = scopeInfo.icon;

							return (
								<div
									key={scope}
									className="flex items-start gap-3 p-3 border rounded-md bg-muted/50"
								>
									<Icon className="size-5 text-muted-foreground shrink-0 mt-0.5" />
									<div className="flex-1 min-w-0">
										<div className="font-medium text-sm">{scopeInfo.label}</div>
										<div className="text-xs text-muted-foreground">
											{scopeInfo.description}
										</div>
									</div>
									<CheckCircle2 className="size-4 text-green-600 shrink-0 mt-1" />
								</div>
							);
						})}
					</div>
				</div>

				{/* User Info */}
				<div className="p-3 border rounded-md bg-muted/30">
					<div className="text-xs text-muted-foreground mb-1">Authorizing as</div>
					<div className="font-medium text-sm">
						{user.user_metadata?.full_name || user.email}
					</div>
					<div className="text-xs text-muted-foreground">{user.email}</div>
				</div>

				{error && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
			</CardContent>

			<CardFooter className="flex gap-3">
				<Button
					variant="outline"
					onClick={handleDeny}
					disabled={loading}
					className="flex-1"
				>
					Deny
				</Button>
				<Button
					onClick={handleApprove}
					disabled={loading || !selectedTeamId}
					className="flex-1"
				>
					{loading ? "Authorizing..." : "Authorize"}
				</Button>
			</CardFooter>

			{/* Security Footer */}
			<div className="px-6 pb-6 text-xs text-muted-foreground text-center">
				By authorizing, you allow this application to access your account.
				You can revoke access at any time from your settings.
			</div>
		</Card>
	);
}
