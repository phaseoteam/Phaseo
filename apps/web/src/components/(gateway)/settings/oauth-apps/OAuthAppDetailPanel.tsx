"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
	AlertCircle,
	Copy,
	Check,
	ExternalLink,
	Users,
	Activity,
	Settings,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import RegenerateSecretDialog from "./RegenerateSecretDialog";
import RedirectUriManager from "./RedirectUriManager";
import DeleteOAuthAppDialog from "./DeleteOAuthAppDialog";

interface OAuthAppDetailPanelProps {
	oauthApp: any;
	authorizations: any[];
	usageStats: any[];
	currentUserId: string;
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

export default function OAuthAppDetailPanel({
	oauthApp,
	authorizations,
	usageStats,
	currentUserId,
}: OAuthAppDetailPanelProps) {
	const [copiedId, setCopiedId] = useState(false);
	const router = useRouter();
	const appRedirectUris = parseRedirectUris(oauthApp.redirect_uris);

	const copyClientId = () => {
		navigator.clipboard.writeText(oauthApp.client_id);
		setCopiedId(true);
		toast.success("Client ID copied to clipboard");
		setTimeout(() => setCopiedId(false), 2000);
	};

	const statusColor = {
		active: "bg-emerald-500",
		suspended: "bg-amber-500",
		deleted: "bg-red-500",
	}[(oauthApp.status as string)] || "bg-gray-500";

	const statusText = {
		active: "Active",
		suspended: "Suspended",
		deleted: "Deleted",
	}[(oauthApp.status as string)] || "Unknown";

	return (
		<div className="space-y-6">
			{/* App Overview Card */}
			<Card>
				<CardHeader>
					<div className="flex items-start justify-between">
						<div className="flex-1">
							<CardTitle className="flex items-center gap-3">
								{oauthApp.name}
								<div className="flex items-center gap-1">
									<span className={`size-2 rounded-full ${statusColor}`} />
									<span className="text-sm font-normal text-muted-foreground">
										{statusText}
									</span>
								</div>
							</CardTitle>
							{oauthApp.description && (
								<CardDescription className="mt-2">
									{oauthApp.description}
								</CardDescription>
							)}
						</div>
						{oauthApp.logo_url && (
							<img
								src={oauthApp.logo_url}
								alt={oauthApp.name}
								className="size-16 rounded-md object-cover border"
							/>
						)}
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div className="p-4 border rounded-md">
							<div className="flex items-center gap-2 text-muted-foreground mb-1">
								<Users className="size-4" />
								<span className="text-sm">Active Users</span>
							</div>
							<div className="text-2xl font-bold">
								{oauthApp.active_authorizations || 0}
							</div>
						</div>
						<div className="p-4 border rounded-md">
							<div className="flex items-center gap-2 text-muted-foreground mb-1">
								<Activity className="size-4" />
								<span className="text-sm">Requests (30d)</span>
							</div>
							<div className="text-2xl font-bold">
								{oauthApp.requests_last_30d || 0}
							</div>
						</div>
						<div className="p-4 border rounded-md">
							<div className="flex items-center gap-2 text-muted-foreground mb-1">
								<Activity className="size-4" />
								<span className="text-sm">Last Used</span>
							</div>
							<div className="text-sm font-medium">
								{oauthApp.last_used_at
									? formatDistanceToNow(new Date(oauthApp.last_used_at), {
											addSuffix: true,
									  })
									: "Never"}
							</div>
						</div>
					</div>

					{oauthApp.homepage_url && (
						<>
							<Separator />
							<div>
								<a
									href={oauthApp.homepage_url}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
								>
									<ExternalLink className="size-4" />
									<span>Visit website</span>
								</a>
							</div>
						</>
					)}
				</CardContent>
			</Card>

			{/* Credentials Card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg flex items-center gap-2">
						<Settings className="size-5" />
						OAuth Credentials
					</CardTitle>
					<CardDescription>
						Use these credentials to integrate with the AI Stats OAuth flow
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							Never share your client secret publicly. Treat it like a password.
						</AlertDescription>
					</Alert>

					<div>
						<label className="text-sm font-medium">Client ID</label>
						<div className="flex items-center gap-2 mt-1">
							<Card className="flex-1 p-3">
								<code className="text-xs break-all">{oauthApp.client_id}</code>
							</Card>
							<Button size="sm" variant="outline" onClick={copyClientId}>
								{copiedId ? (
									<Check className="h-4 w-4" />
								) : (
									<Copy className="h-4 w-4" />
								)}
							</Button>
						</div>
					</div>

					<div>
						<div className="flex items-center justify-between mb-1">
							<label className="text-sm font-medium">Client Secret</label>
							<RegenerateSecretDialog
								clientId={oauthApp.client_id}
								appName={oauthApp.name}
							/>
						</div>
						<Card className="p-3 bg-muted">
							<code className="text-xs text-muted-foreground">
								****************************
							</code>
						</Card>
						<p className="text-xs text-muted-foreground mt-1">
							Hidden for security. Regenerate if compromised.
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Redirect URIs Card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Redirect URIs</CardTitle>
					<CardDescription>
						Authorized callback URLs for your OAuth flow
					</CardDescription>
				</CardHeader>
				<CardContent>
					<RedirectUriManager
						clientId={oauthApp.client_id}
						initialRedirectUris={appRedirectUris}
					/>
				</CardContent>
			</Card>

			{/* Recent Authorizations */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Recent Authorizations</CardTitle>
					<CardDescription>
						Users who have authorized your app
					</CardDescription>
				</CardHeader>
				<CardContent>
					{authorizations.length === 0 ? (
						<div className="text-sm text-muted-foreground text-center py-8">
							No authorizations yet
						</div>
					) : (
						<div className="space-y-2">
							{authorizations.map((auth) => (
								<div
									key={auth.id}
									className="flex items-center justify-between p-3 border rounded-md"
								>
									<div>
										<div className="font-medium text-sm">
											{auth.users?.full_name || auth.users?.email || "Unknown User"}
										</div>
										<div className="text-xs text-muted-foreground">
											{auth.teams?.name || "Unknown Team"}
										</div>
									</div>
									<div className="text-xs text-muted-foreground">
										{auth.last_used_at
											? `Used ${formatDistanceToNow(new Date(auth.last_used_at), {
													addSuffix: true,
											  })}`
											: "Never used"}
									</div>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>

			{/* Danger Zone */}
			<Card className="border-red-200 dark:border-red-900">
				<CardHeader>
					<CardTitle className="text-lg text-red-600 dark:text-red-400 flex items-center gap-2">
						<Trash2 className="size-5" />
						Danger Zone
					</CardTitle>
					<CardDescription>
						Irreversible actions that will affect all users
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between">
						<div>
							<div className="font-medium text-sm">Delete OAuth App</div>
							<div className="text-xs text-muted-foreground">
								This will revoke all user authorizations and cannot be undone
							</div>
						</div>
						<DeleteOAuthAppDialog
							clientId={oauthApp.client_id}
							appName={oauthApp.name}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

