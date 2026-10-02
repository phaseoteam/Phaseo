"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
	AlertCircle,
	CheckCircle2,
	ExternalLink,
	KeyRound,
	Lock,
	Search,
	Settings2,
	Shield,
	Users,
	Wrench,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { isSafeOAuthRedirectUrl } from "@/lib/oauth/safeUrls";
import {
	groupConsentScopes,
	type ConsentScopeGroupKey,
} from "./consentScopeGroups";
import { scopePermissionFor, type ScopePermission, type ScopeTone } from "./scopePermission";

interface ConsentFormProps {
	oauthApp: any;
	user: any;
	teams: Array<{ id: string; name: string }>;
	requestedScopes: string[];
	authorizationId?: string;
	clientId?: string;
	redirectUri?: string;
	state?: string;
	codeChallenge?: string;
	codeChallengeMethod?: string;
	resource?: string;
}

function scopeToneBadge(tone: ScopeTone) {
	if (tone === "identity") return { className: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300" };
	if (tone === "delete") return { className: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" };
	if (tone === "write") return { className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" };
	return { className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" };
}

function scopeGroupIcon(key: ConsentScopeGroupKey) {
	if (key === "identity" || key === "guardrails") return Shield;
	if (key === "gateway" || key === "keys") return KeyRound;
	if (key === "catalog" || key === "data") return Search;
	if (key === "workspaces") return Users;
	if (key === "management-keys") return Wrench;
	if (key === "oauth-apps") return Lock;
	return Settings2;
}

function consentLogoSrc(value: unknown): string | null {
	if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
	return value;
}

function displayHostname(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

export default function ConsentForm({
	oauthApp,
	user,
	teams,
	requestedScopes,
	authorizationId,
	clientId,
	redirectUri,
	state,
	codeChallenge,
	codeChallengeMethod,
	resource,
}: ConsentFormProps) {
	const t = useTranslations("Common.authFlows.oauthConsent");
	const tSettings = useTranslations("SettingsUI");
	const resources = t.raw("resources" as never) as Record<string, string>;
	const groups = t.raw("groups" as never) as Record<string, { title: string; description: string }>;
	const initialTeamIds = teams.map((team) => team.id);
	const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(
		teams.length <= 3 ? initialTeamIds : teams.length === 1 ? initialTeamIds : [teams[0]?.id].filter(Boolean),
	);
	const [primaryTeamId, setPrimaryTeamId] = useState<string>(
		teams[0]?.id ?? "",
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [unverifiedAcknowledged, setUnverifiedAcknowledged] = useState(false);
	const [selectedScopes, setSelectedScopes] = useState<string[]>(requestedScopes);
	const isFirstParty = Boolean(oauthApp.is_first_party);
	const isUnverified = oauthApp.registration_source === "dynamic" && !oauthApp.is_first_party;
	const displayedAppDescription = isFirstParty ? t("firstPartyDescription") : oauthApp.description;
	const logoSrc = consentLogoSrc(oauthApp.logo_url);
	const redirectHostname = displayHostname(redirectUri);

	const selectedCount = selectedTeamIds.length;
	const allSelected = selectedCount === teams.length;
	const scopeGroups = useMemo(
		() => groupConsentScopes(requestedScopes).map((group) => ({
			...group,
				scopes: group.scopes.map((scope) => ({
					...scopePermissionFor(scope),
				icon: scopeGroupIcon(group.key),
			})),
		})),
		[requestedScopes],
	);
	const permissionCount = scopeGroups.reduce((total, group) => total + group.scopes.length, 0);
	const permissionCopy = (permission: ScopePermission) => {
		if (permission.action === "identity") {
			return { label: t("identityPermissionLabel"), description: t("identityPermissionDescription") };
		}
		if (permission.action === "gateway") {
			return { label: t("gatewayPermissionLabel"), description: t("gatewayPermissionDescription") };
		}
		if (permission.action === "unknown" || !permission.resourceKey) {
			return {
				label: t("unknownPermissionLabel", { scope: permission.scope }),
				description: t("unknownPermissionDescription", { scope: permission.scope }),
			};
		}
		const resource = resources[permission.resourceKey] ?? permission.scope;
		if (permission.action === "read") {
			return { label: t("readPermissionLabel", { resource }), description: t("readPermissionDescription", { resource }) };
		}
		if (permission.action === "manage") {
			return { label: t("managePermissionLabel", { resource }), description: t("managePermissionDescription", { resource }) };
		}
		return { label: t("deletePermissionLabel", { resource }), description: t("deletePermissionDescription", { resource }) };
	};
	const toneLabel = (tone: ScopeTone) => {
		if (tone === "identity") return t("toneIdentity");
		if (tone === "delete") return t("toneDelete");
		if (tone === "write") return t("toneWrite");
		return t("toneRead");
	};
	const groupCopy = (key: ConsentScopeGroupKey) => groups[key] ?? {
		title: t("otherGroupTitle"),
		description: t("otherGroupDescription", { scope: key.slice("other:".length) }),
	};
	const requiredScopes = useMemo(() => new Set([
		"openid",
		...(requestedScopes.includes("gateway:access") ? ["gateway:access"] : []),
	]), [requestedScopes]);

	const handleScopeToggle = (scope: string, checked: boolean) => {
		if (requiredScopes.has(scope)) return;
		setSelectedScopes((current) => checked
			? Array.from(new Set([...current, scope]))
			: current.filter((value) => value !== scope));
	};

	const handleTeamToggle = (teamId: string, checked: boolean) => {
		setSelectedTeamIds((current) => {
			const next = checked
				? Array.from(new Set([...current, teamId]))
				: current.filter((id) => id !== teamId);
			if (!next.length) {
				setPrimaryTeamId("");
				return next;
			}
			if (!next.includes(primaryTeamId)) {
				setPrimaryTeamId(next[0]);
			}
			return next;
		});
	};

	const handleSelectAll = () => {
		setSelectedTeamIds(initialTeamIds);
		if (!primaryTeamId && initialTeamIds[0]) {
			setPrimaryTeamId(initialTeamIds[0]);
		}
	};

	const handleClearTeams = () => {
		setSelectedTeamIds([]);
		setPrimaryTeamId("");
	};

	const handleApprove = async () => {
		if (isUnverified && !unverifiedAcknowledged) {
			setError(t("confirmUnverified"));
			return;
		}
		if (!selectedTeamIds.length) {
			setError(t("selectTeam"));
			return;
		}
		if (!primaryTeamId || !selectedTeamIds.includes(primaryTeamId)) {
			setError(t("choosePrimaryTeam"));
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const response = await fetch("/oauth/consent/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					operation: "approve",
					authorization_id: authorizationId,
					client_id: clientId,
					workspace_id: primaryTeamId,
					workspace_ids: selectedTeamIds,
					scopes: selectedScopes,
					redirect_uri: redirectUri,
					state,
					code_challenge: codeChallenge,
					code_challenge_method: codeChallengeMethod,
					resource,
				}),
			});
			const result = await response.json();

			if (result.error) {
				setError(t("approvalFailed"));
				return;
			}

			if (result.data?.redirect_url) {
				if (!isSafeOAuthRedirectUrl(result.data.redirect_url)) {
					setError(t("unsafeRedirect"));
					return;
				}
				window.location.assign(result.data.redirect_url);
			}
		} catch {
			setError(t("approvalFailed"));
		} finally {
			setLoading(false);
		}
	};

	const handleDeny = async () => {
		setLoading(true);
		setError(null);

		try {
			const response = await fetch("/oauth/consent/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					operation: "deny",
					authorization_id: authorizationId,
					client_id: clientId,
					redirect_uri: redirectUri,
					state,
				}),
			});
			const result = await response.json();

			if (result.data?.redirect_url) {
				if (!isSafeOAuthRedirectUrl(result.data.redirect_url)) {
					setError(t("unsafeRedirect"));
					return;
				}
				window.location.assign(result.data.redirect_url);
			}
		} catch {
			setError(t("denialFailed"));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Card className="shadow-lg">
			<CardHeader className="space-y-4">
				<div className="flex justify-end">
					<Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700">
						OAuth {tSettings("oauthAppsPage.alphaLabel")}
					</Badge>
				</div>

				<div className="flex items-start gap-4">
					{isFirstParty ? (
						<div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-foreground shadow-sm">
							<Image
								src="/logo_dark.svg"
								alt="Phaseo"
								width={48}
								height={48}
								className="size-12 object-contain dark:hidden"
							/>
							<Image
								src="/logo_light.svg"
								alt="Phaseo"
								width={48}
								height={48}
								className="hidden size-12 object-contain dark:block"
							/>
						</div>
					) : logoSrc ? (
						<Image
							src={logoSrc}
							alt={oauthApp.name}
							width={64}
							height={64}
							className="size-16 rounded-md object-cover border"
						/>
					) : (
						<div className="size-16 rounded-md border bg-muted flex items-center justify-center">
							<Shield className="size-8 text-muted-foreground" />
						</div>
					)}
					<div className="min-w-0 flex-1">
						<div className="flex flex-wrap items-center gap-2">
							<CardTitle className="text-2xl">{oauthApp.name}</CardTitle>
							{isFirstParty ? (
								<Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
									<CheckCircle2 className="size-3" />
									{t("officialApp")}
								</Badge>
							) : null}
						</div>
						<CardDescription className="mt-1">
							{t("wantsAccess")}
						</CardDescription>
						{oauthApp.homepage_url && (
							<a
								href={oauthApp.homepage_url}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 underline decoration-transparent hover:decoration-current transition-colors duration-200 mt-2"
							>
								<ExternalLink className="size-3" />
								<span>{new URL(oauthApp.homepage_url).hostname}</span>
							</a>
						)}
					</div>
				</div>

				{displayedAppDescription && (
					<p className="text-sm text-muted-foreground">{displayedAppDescription}</p>
				)}
			</CardHeader>

			<CardContent className="space-y-6">
				{isUnverified && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription className="space-y-2">
							<p><strong>{t("unverifiedTitle")}</strong> {t("unverifiedDescription")}</p>
							<div className="font-mono text-xs break-all">{t("clientLine", { client: clientId ?? oauthApp.client_id ?? "unknown" })}</div>
							{redirectHostname && <div className="text-xs">{t("redirectLine", { hostname: redirectHostname })}</div>}
							<label className="flex items-start gap-2 pt-1 text-sm">
								<Checkbox
									checked={unverifiedAcknowledged}
									onCheckedChange={(checked) => setUnverifiedAcknowledged(checked === true)}
								/>
								<span>{t("unverifiedAcknowledgement")}</span>
							</label>
						</AlertDescription>
					</Alert>
				)}
				<Alert>
					<Shield className="h-4 w-4" />
					<AlertDescription>
						{t("trustWarning")}
					</AlertDescription>
				</Alert>

				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<Label>{t("teamsTitle")}</Label>
							<p className="text-xs text-muted-foreground mt-1">
								{t("teamsDescription")}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button type="button" variant="outline" size="sm" onClick={handleSelectAll} disabled={allSelected} className="rounded-md">
								{t("selectAll")}
							</Button>
							<Button type="button" variant="ghost" size="sm" onClick={handleClearTeams} disabled={!selectedCount} className="rounded-md">
								{t("clear")}
							</Button>
						</div>
					</div>

					<div className="rounded-xl border overflow-hidden">
						{teams.map((team, index) => {
							const selected = selectedTeamIds.includes(team.id);
							const primary = primaryTeamId === team.id;
							return (
								<div
									key={team.id}
									className={`flex items-center gap-3 px-4 py-3 ${index !== 0 ? "border-t" : ""} ${selected ? "bg-muted/40" : ""}`}
								>
									<Checkbox
										id={`team-${team.id}`}
										checked={selected}
										onCheckedChange={(checked) => handleTeamToggle(team.id, checked === true)}
									/>
									<div className="min-w-0 flex-1">
										<label htmlFor={`team-${team.id}`} className="block cursor-pointer font-medium text-sm">
											{team.name}
										</label>
										<p className="text-xs text-muted-foreground">
											{selected
												? primary
													? t("selectedAndActive")
													: t("selectedForAccess")
												: t("notSelected")}
										</p>
									</div>
									<Button
										type="button"
										variant={primary ? "default" : "outline"}
										size="sm"
										className="rounded-md"
										disabled={!selected}
										onClick={() => setPrimaryTeamId(team.id)}
									>
										{primary ? t("activeNow") : t("useNow")}
									</Button>
								</div>
							);
						})}
					</div>

					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{t("teamsSelected", { count: selectedCount })}</span>
						<span>{primaryTeamId ? t("primaryTeamChosen") : t("choosePrimaryTeamLabel")}</span>
					</div>
				</div>

				<div className="space-y-3">
					<div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
						<div>
							<Label>{t("requestedPermissions")}</Label>
							<p className="text-xs text-muted-foreground mt-1">
								{t("permissionsDescription")}
							</p>
						</div>
						<p className="shrink-0 text-xs text-muted-foreground sm:text-right">
							{t("permissionsSelected", { selected: selectedScopes.length, total: permissionCount })}
						</p>
					</div>
					<Accordion
						type="multiple"
						defaultValue={scopeGroups.some((group) => group.key === "identity") ? ["identity"] : []}
						className="gap-2"
					>
						{scopeGroups.map((group) => {
							const GroupIcon = scopeGroupIcon(group.key);
							const tones = Array.from(new Set(group.scopes.map((scope) => scope.tone)));
							const localizedGroup = groupCopy(group.key);
							return (
								<AccordionItem key={group.key} value={group.key} className="overflow-hidden rounded-md border">
									<AccordionTrigger className="gap-3 px-4 py-3 hover:bg-muted/40">
										<div className="flex min-w-0 flex-1 items-start gap-3">
											<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
												<GroupIcon className="size-4 text-muted-foreground" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<span>{localizedGroup.title}</span>
													<Badge variant="secondary" className="rounded-md font-normal">
														{group.scopes.length}
													</Badge>
													{tones.map((tone) => {
														const badge = scopeToneBadge(tone);
														return (
															<Badge key={tone} variant="outline" className={`${badge.className} rounded-md`}>
																{toneLabel(tone)}
															</Badge>
														);
													})}
												</div>
												<p className="mt-1 text-xs font-normal text-muted-foreground">
													{localizedGroup.description}
												</p>
											</div>
										</div>
									</AccordionTrigger>
									<AccordionContent className="space-y-2 px-3 pb-3">
									{group.scopes.map((scopeInfo) => {
										const Icon = scopeInfo.icon;
										const tone = scopeToneBadge(scopeInfo.tone);
										const required = requiredScopes.has(scopeInfo.scope);
										const localizedPermission = permissionCopy(scopeInfo);
										return (
											<label key={scopeInfo.scope} className={`flex items-start gap-3 rounded-md bg-muted/40 p-3 ${required ? "" : "cursor-pointer hover:bg-muted/60"}`}>
												<Checkbox
													checked={selectedScopes.includes(scopeInfo.scope)}
													disabled={required}
													onCheckedChange={(checked) => handleScopeToggle(scopeInfo.scope, checked === true)}
													aria-label={t(selectedScopes.includes(scopeInfo.scope) ? "allowPermission" : "disallowPermission", { permission: localizedPermission.label })}
													className="mt-1"
												/>
												<Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-2">
														<div className="font-medium text-sm">{localizedPermission.label}</div>
														<Badge variant="outline" className={`${tone.className} rounded-md`}>
															{toneLabel(scopeInfo.tone)}
														</Badge>
														{required ? <Badge variant="secondary" className="rounded-md font-normal">{t("required")}</Badge> : null}
														</div>
														<div className="text-xs text-muted-foreground mt-1">
															{localizedPermission.description}
														</div>
														<div className="mt-1 font-mono text-[11px] text-muted-foreground/80">
															{scopeInfo.scope}
														</div>
													</div>
											</label>
											);
										})}
									</AccordionContent>
								</AccordionItem>
							);
						})}
					</Accordion>
				</div>

				<div className="rounded-md border bg-muted/30 p-3">
					<div className="text-xs text-muted-foreground mb-1">{t("authorizingAs")}</div>
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
				<Button variant="outline" onClick={handleDeny} disabled={loading} className="flex-1 rounded-md">
					{t("deny")}
				</Button>
				<Button
					onClick={handleApprove}
					disabled={loading || !selectedTeamIds.length || !primaryTeamId || (isUnverified && !unverifiedAcknowledged)}
					className="flex-1 rounded-md"
				>
					{loading ? t("authorizing") : t("authorizePermissions", { count: selectedScopes.length })}
				</Button>
			</CardFooter>

			<div className="px-6 pb-6 text-center text-xs text-muted-foreground">
				{t("authorizationNotice")}
			</div>
		</Card>
	);
}
