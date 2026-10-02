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
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { useTranslations } from "next-intl";
import RegenerateSecretDialog from "./RegenerateSecretDialog";
import RedirectUriManager from "./RedirectUriManager";
import DeleteOAuthAppDialog from "./DeleteOAuthAppDialog";
import OAuthScopeSelector from "./OAuthScopeSelector";
import { normalizeOAuthScopes } from "@/lib/oauth/scopes";
import { updateOAuthAppScopesAction } from "@/app/(dashboard)/settings/oauth-apps/actions";
import { localizedSettingsError } from "@/i18n/error-messages";

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
	const translate = useTranslations("SettingsUI");
	const t = (key: string, values?: Record<string, unknown>) =>
		translate(
			(key.startsWith("oauthDetail.")
				? key.replace("oauthDetail.", "oauthDetailCopy.")
				: key) as never,
			values as never,
		);
	const write = useSettingsWrite();
	const [copiedId, setCopiedId] = useState(false);
	const [allowedScopes, setAllowedScopes] = useState(() => normalizeOAuthScopes(oauthApp.allowed_scopes));
	const [savingScopes, setSavingScopes] = useState(false);
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
		toast.success(t("strings.Client ID copied to clipboard" as never));
		setTimeout(() => setCopiedId(false), 2000);
	};

	const saveScopes = async () => {
		setSavingScopes(true);
		try {
			const result = await write(updateOAuthAppScopesAction(oauthApp.client_id, allowedScopes));
			if (result.error) throw new Error(result.error);
		toast.success(t("strings.OAuth scopes updated" as never));
		} catch (error: unknown) {
			toast.error(
				localizedSettingsError(error, translate, "Failed to update OAuth scopes"),
			);
		} finally {
			setSavingScopes(false);
		}
	};

	const statusColor = {
		active: "bg-emerald-500",
		suspended: "bg-amber-500",
		deleted: "bg-red-500",
	}[(oauthApp.status as string)] || "bg-gray-500";

	const statusText = t(`oauthDetail.${oauthApp.status as string}` as never) || t("oauthDetail.unknown");

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
						<span className="text-sm">{t("strings.Active Users" as never)}</span>
							</div>
							<div className="text-2xl font-bold">
								{oauthApp.active_authorizations || 0}
							</div>
						</div>
						<div className="p-4 border rounded-md">
							<div className="flex items-center gap-2 text-muted-foreground mb-1">
								<Activity className="size-4" />
						<span className="text-sm">{t("strings.Requests (30d)" as never)}</span>
							</div>
							<div className="text-2xl font-bold">
								{oauthApp.requests_last_30d || 0}
							</div>
						</div>
						<div className="p-4 border rounded-md">
							<div className="flex items-center gap-2 text-muted-foreground mb-1">
								<Activity className="size-4" />
						<span className="text-sm">{t("strings.Last Used" as never)}</span>
							</div>
							<div className="text-sm font-medium">
								{oauthApp.last_used_at
									? formatDistanceToNow(new Date(oauthApp.last_used_at), {
											addSuffix: true,
									  })
											: t("oauthDetail.never")}
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
						<span>{t("strings.Visit website" as never)}</span>
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
						{t("oauthDetail.credentials")}
					</CardTitle>
					<CardDescription>
						{t("oauthDetail.credentialsDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							{t("oauthDetail.secretWarning")}
						</AlertDescription>
					</Alert>

					<div>
					<label className="text-sm font-medium">{t("strings.Client ID" as never)}</label>
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
					<label className="text-sm font-medium">{t("strings.Client Secret" as never)}</label>
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
							{t("oauthDetail.hiddenSecret")}
						</p>
					</div>
				</CardContent>
			</Card>

			{/* Redirect URIs Card */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">{t("oauth.redirectUri")}</CardTitle>
					<CardDescription>
						{t("oauthDetail.authorizedCallbacks")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<RedirectUriManager
						clientId={oauthApp.client_id}
						initialRedirectUris={appRedirectUris}
					/>
				</CardContent>
			</Card>

			{/* Allowed OAuth scopes */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">{t("strings.Scopes this app may request" as never)}</CardTitle>
					<CardDescription>
						{t("oauthDetail.scopesDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							{t("oauthDetail.scopeWarning")}
						</AlertDescription>
					</Alert>
					<OAuthScopeSelector selectedScopes={allowedScopes} onChange={setAllowedScopes} disabled={savingScopes} />
					<div className="flex justify-end">
						<Button onClick={saveScopes} disabled={savingScopes || allowedScopes.length === 0}>
							{savingScopes ? t("oauthDetail.saving") : t("oauthDetail.saveScopes")}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Recent Authorizations */}
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">{t("strings.Recent Authorizations" as never)}</CardTitle>
					<CardDescription>
						{t("oauthDetail.authorizedUsers")}
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
					<EmptyTitle className="text-base">{t("oauthDetail.noAuthorizations")}</EmptyTitle>
								<EmptyDescription>
									{t("oauthDetail.authorizationEmpty")}
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
											{auth.users?.full_name || auth.users?.email || t("oauthDetail.unknownUser")}
										</div>
										<div className="text-xs text-muted-foreground">
											{auth.teams?.name || t("oauthDetail.unknownWorkspace")}
										</div>
									</div>
									<div className="text-xs text-muted-foreground">
										{auth.last_used_at
											? `Used ${formatDistanceToNow(new Date(auth.last_used_at), {
													addSuffix: true,
											  })}`
												  : t("oauthDetail.neverUsed")}
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
					<CardTitle className="text-lg">{t("strings.User Activity (Recent)" as never)}</CardTitle>
					<CardDescription>
						{t("oauthDetail.activityDescription")}
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
					<EmptyTitle className="text-base">{t("oauthDetail.noActivity")}</EmptyTitle>
								<EmptyDescription>
									{t("oauthDetail.activityEmpty")}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
																												<TableHead>{t("oauthDetail.user")}</TableHead>
																												<TableHead className="text-right">{t("oauthDetail.requests")}</TableHead>
																												<TableHead className="text-right">{t("oauthDetail.success")}</TableHead>
																												<TableHead className="text-right">{t("oauthDetail.errors")}</TableHead>
																												<TableHead className="text-right">{t("oauthDetail.spend")}</TableHead>
																												<TableHead className="text-right">{t("oauthDetail.lastUsed")}</TableHead>
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
																																							{t("oauthDetail.you")}
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
						{t("oauthDetail.requestLogs")}
					</CardTitle>
					<CardDescription>
						{t("oauthDetail.latestRequests", { count: String(recentRequests.length) })}
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
								<EmptyTitle className="text-base">{t("oauthDetail.logsEmpty")}</EmptyTitle>
								<EmptyDescription>
									{t("oauthDetail.logsEmptyDescription")}
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					) : (
						<div className="rounded-md border">
							<ScrollArea className="max-h-[440px]">
								<Table>
									<TableHeader>
										<TableRow>
												<TableHead>{t("oauthDetail.time")}</TableHead>
												<TableHead>{t("oauthDetail.user")}</TableHead>
												<TableHead>{t("oauthDetail.endpoint")}</TableHead>
												<TableHead>{t("oauthDetail.model")}</TableHead>
												<TableHead>{t("oauthDetail.provider")}</TableHead>
												<TableHead className="text-right">{t("oauthDetail.status")}</TableHead>
												<TableHead className="text-right">{t("oauthDetail.cost")}</TableHead>
												<TableHead className="text-right">{t("oauthDetail.latency")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{recentRequests.map((request) => {
											const identity = request.oauth_user_id
												? userDirectoryMap.get(request.oauth_user_id)
												: null;
										const userLabel =
											identity?.email ||
											request.oauth_user_id ||
											t("strings.Unknown");
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
						{translate("strings.Danger Zone" as never)}
					</CardTitle>
					<CardDescription>
						{translate("oauthCopy.irreversibleActionsDescription")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between">
						<div>
							<div className="font-medium text-sm">{translate("oauthDetail.deleteApp")}</div>
							<div className="text-xs text-muted-foreground">
												{t("oauthDetail.deleteDescription")}
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

