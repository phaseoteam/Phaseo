"use client";

import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	AlertCircle,
	Copy,
	Check,
	ExternalLink,
	Users,
	Activity,
	Settings,
	Trash2,
	FileClock,
	XCircle,
	CheckCircle2,
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
	recentRequests: Array<{
		request_id: string;
		created_at: string;
		oauth_user_id: string | null;
		endpoint: string | null;
		model_id: string | null;
		provider: string | null;
		success: boolean;
		status_code: number | null;
		error_code: string | null;
		cost_nanos: number | null;
		latency_ms: number | null;
	}>;
	userDirectory: Array<{
		user_id: string;
		full_name: string | null;
		email: string | null;
	}>;
	currentUserId: string;
}

interface UserRequestSummary {
	userId: string;
	requestCount: number;
	successCount: number;
	errorCount: number;
	totalCostNanos: number;
	lastUsedAt: string;
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

function formatCostUsd(nanos: number | null | undefined): string {
	const value = Number(nanos ?? 0) / 1e9;
	if (!Number.isFinite(value)) return "$0";
	if (value === 0) return "$0";
	return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

function formatRelative(timestamp: string | null | undefined): string {
	if (!timestamp) return "Never";
	return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
}

export default function OAuthAppDetailPanel({
	oauthApp,
	authorizations,
	usageStats,
	recentRequests,
	userDirectory,
	currentUserId,
}: OAuthAppDetailPanelProps) {
	const [copiedId, setCopiedId] = useState(false);
	const appRedirectUris = parseRedirectUris(oauthApp.redirect_uris);
	const userDirectoryMap = useMemo(() => {
		const map = new Map<string, { full_name: string | null; email: string | null }>();
		for (const user of userDirectory) {
			if (!user?.user_id) continue;
			map.set(user.user_id, {
				full_name: user.full_name ?? null,
				email: user.email ?? null,
			});
		}
		return map;
	}, [userDirectory]);

	const userSummaries = useMemo<UserRequestSummary[]>(() => {
		const map = new Map<string, UserRequestSummary>();
		for (const request of recentRequests) {
			if (!request.oauth_user_id) continue;
			const existing = map.get(request.oauth_user_id);
			if (!existing) {
				map.set(request.oauth_user_id, {
					userId: request.oauth_user_id,
					requestCount: 1,
					successCount: request.success ? 1 : 0,
					errorCount: request.success ? 0 : 1,
					totalCostNanos: Number(request.cost_nanos ?? 0),
					lastUsedAt: request.created_at,
				});
				continue;
			}

			existing.requestCount += 1;
			existing.successCount += request.success ? 1 : 0;
			existing.errorCount += request.success ? 0 : 1;
			existing.totalCostNanos += Number(request.cost_nanos ?? 0);
			if (
				new Date(request.created_at).getTime() >
				new Date(existing.lastUsedAt).getTime()
			) {
				existing.lastUsedAt = request.created_at;
			}
		}

		return Array.from(map.values()).sort((a, b) => {
			if (b.requestCount !== a.requestCount) return b.requestCount - a.requestCount;
			return (
				new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
			);
		});
	}, [recentRequests]);

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
									className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 underline decoration-transparent hover:decoration-current transition-colors duration-200"
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
						<Empty
							size="compact"
							className="rounded-lg border border-dashed border-border/80 p-8"
						>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Users className="h-5 w-5" />
								</EmptyMedia>
								<EmptyTitle className="text-base">No authorizations yet</EmptyTitle>
								<EmptyDescription>
									Users who authorize this app will appear here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
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
											{auth.teams?.name || "Unknown Workspace"}
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

			{/* User Activity */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">User Activity (Recent)</CardTitle>
					<CardDescription>
						Request activity by end user from the latest OAuth request logs
					</CardDescription>
				</CardHeader>
				<CardContent>
					{userSummaries.length === 0 ? (
						<Empty
							size="compact"
							className="rounded-lg border border-dashed border-border/80 p-8"
						>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<Users className="h-5 w-5" />
								</EmptyMedia>
								<EmptyTitle className="text-base">No user activity yet</EmptyTitle>
								<EmptyDescription>
									User-level OAuth activity will appear after successful requests.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>User</TableHead>
										<TableHead className="text-right">Requests</TableHead>
										<TableHead className="text-right">Success</TableHead>
										<TableHead className="text-right">Errors</TableHead>
										<TableHead className="text-right">Spend</TableHead>
										<TableHead className="text-right">Last Used</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{userSummaries.map((summary) => {
										const identity = userDirectoryMap.get(summary.userId);
										const displayName =
											identity?.full_name || identity?.email || summary.userId;
										return (
											<TableRow key={summary.userId}>
												<TableCell className="min-w-[220px]">
													<div className="space-y-0.5">
														<div className="flex items-center gap-2">
															<div className="text-sm font-medium">{displayName}</div>
															{summary.userId === currentUserId ? (
																<Badge variant="outline" className="text-[10px]">
																	You
																</Badge>
															) : null}
														</div>
														<div className="text-xs text-muted-foreground font-mono">
															{summary.userId}
														</div>
													</div>
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{summary.requestCount}
												</TableCell>
												<TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
													{summary.successCount}
												</TableCell>
												<TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
													{summary.errorCount}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatCostUsd(summary.totalCostNanos)}
												</TableCell>
												<TableCell className="text-right text-muted-foreground">
													{formatRelative(summary.lastUsedAt)}
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Recent Request Logs */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg flex items-center gap-2">
						<FileClock className="size-5" />
						Recent OAuth Request Logs
					</CardTitle>
					<CardDescription>
						Latest {recentRequests.length} requests for this OAuth app
					</CardDescription>
				</CardHeader>
				<CardContent>
					{recentRequests.length === 0 ? (
						<Empty
							size="compact"
							className="rounded-lg border border-dashed border-border/80 p-8"
						>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<FileClock className="h-5 w-5" />
								</EmptyMedia>
								<EmptyTitle className="text-base">No request logs yet</EmptyTitle>
								<EmptyDescription>
									Log rows will appear after this OAuth app starts making requests.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="rounded-md border">
							<ScrollArea className="max-h-[440px]">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Time</TableHead>
											<TableHead>User</TableHead>
											<TableHead>Endpoint</TableHead>
											<TableHead>Model</TableHead>
											<TableHead>Provider</TableHead>
											<TableHead className="text-right">Status</TableHead>
											<TableHead className="text-right">Cost</TableHead>
											<TableHead className="text-right">Latency</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{recentRequests.map((request) => {
											const identity = request.oauth_user_id
												? userDirectoryMap.get(request.oauth_user_id)
												: null;
											const userLabel = identity?.email || request.oauth_user_id || "Unknown";
											return (
												<TableRow key={`${request.request_id}-${request.created_at}`}>
													<TableCell className="whitespace-nowrap text-xs text-muted-foreground">
														{formatRelative(request.created_at)}
													</TableCell>
													<TableCell className="max-w-[220px] truncate text-xs font-mono">
														{userLabel}
													</TableCell>
													<TableCell className="max-w-[220px] truncate text-xs">
														{request.endpoint ?? "--"}
													</TableCell>
													<TableCell className="max-w-[220px] truncate text-xs">
														{request.model_id ?? "--"}
													</TableCell>
													<TableCell className="max-w-[180px] truncate text-xs">
														{request.provider ?? "--"}
													</TableCell>
													<TableCell className="text-right">
														{request.success ? (
															<Badge
																variant="outline"
																className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
															>
																<CheckCircle2 className="h-3 w-3" />
																200
															</Badge>
														) : (
															<Badge
																variant="outline"
																className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
															>
																<XCircle className="h-3 w-3" />
																{request.status_code ?? "ERR"}
															</Badge>
														)}
													</TableCell>
													<TableCell className="text-right tabular-nums text-xs">
														{formatCostUsd(request.cost_nanos)}
													</TableCell>
													<TableCell className="text-right tabular-nums text-xs text-muted-foreground">
														{request.latency_ms ? `${request.latency_ms}ms` : "--"}
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</ScrollArea>
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


