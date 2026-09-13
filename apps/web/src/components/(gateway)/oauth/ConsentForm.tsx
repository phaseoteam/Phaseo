"use client";

import React, { useMemo, useState } from "react";
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

type ScopeMeta = {
	label: string;
	description: string;
	icon: any;
	tone: "identity" | "read" | "write" | "delete";
};

const SCOPE_META: Record<string, ScopeMeta> = {
	openid: {
		label: "Confirm identity",
		description: "Lets the app verify who is signing in.",
		icon: Shield,
		tone: "identity",
	},
	profile: {
		label: "Read profile",
		description: "Lets the app read basic profile details such as display name.",
		icon: Users,
		tone: "identity",
	},
	email: {
		label: "Read email",
		description: "Lets the app read the email address on the signed-in account.",
		icon: Shield,
		tone: "identity",
	},
	"gateway:access": {
		label: "Use AI Gateway with your credits",
		description: "Lets the app run model inference billed to the workspace you select.",
		icon: KeyRound,
		tone: "write",
	},
	"me:read": {
		label: "Read current account",
		description: "Lets the app inspect the current user and active workspace context.",
		icon: Users,
		tone: "read",
	},
	"models:read": {
		label: "Read models",
		description: "Lets the app inspect available model catalog data.",
		icon: Search,
		tone: "read",
	},
	"providers:read": {
		label: "Read providers",
		description: "Lets the app inspect provider availability and metadata.",
		icon: Search,
		tone: "read",
	},
	"pricing:read": {
		label: "Read pricing",
		description: "Lets the app inspect pricing and cost reference data.",
		icon: Search,
		tone: "read",
	},
	"credits:read": {
		label: "Read credits",
		description: "Lets the app read workspace credit balances and related usage state.",
		icon: Search,
		tone: "read",
	},
	"activity:read": {
		label: "Read activity",
		description: "Lets the app inspect recent workspace activity and operational history.",
		icon: Search,
		tone: "read",
	},
	"analytics:read": {
		label: "Read analytics",
		description: "Lets the app view analytics and usage reporting data.",
		icon: Search,
		tone: "read",
	},
	"generations:read": {
		label: "Read generations",
		description: "Lets the app inspect past generation records and related output metadata.",
		icon: Search,
		tone: "read",
	},
	"feedback:read": {
		label: "Read feedback",
		description: "Lets the app inspect workspace feedback, observability events, and preset test runs.",
		icon: Search,
		tone: "read",
	},
	"feedback:write": {
		label: "Manage feedback",
		description: "Lets the app create feedback, observability events, and preset test runs.",
		icon: Settings2,
		tone: "write",
	},
	"workspaces:read": {
		label: "Read teams",
		description: "Lets the app list teams you belong to and inspect their metadata.",
		icon: Users,
		tone: "read",
	},
	"workspaces:write": {
		label: "Manage teams",
		description: "Lets the app create or update team records on your behalf.",
		icon: Users,
		tone: "write",
	},
	"workspaces:delete": {
		label: "Delete teams",
		description: "Lets the app permanently delete team records and their associated configuration.",
		icon: Users,
		tone: "delete",
	},
	"keys:read": {
		label: "Read API keys",
		description: "Lets the app list existing API key metadata for selected teams.",
		icon: KeyRound,
		tone: "read",
	},
	"keys:write": {
		label: "Create API keys",
		description: "Lets the app create or update API keys for selected teams.",
		icon: KeyRound,
		tone: "write",
	},
	"keys:delete": {
		label: "Delete API keys",
		description: "Lets the app permanently remove API keys for selected teams.",
		icon: KeyRound,
		tone: "delete",
	},
	"presets:read": {
		label: "Read presets",
		description: "Lets the app inspect saved routing and prompt presets.",
		icon: Settings2,
		tone: "read",
	},
	"presets:write": {
		label: "Manage presets",
		description: "Lets the app create or update saved presets.",
		icon: Settings2,
		tone: "write",
	},
	"presets:delete": {
		label: "Delete presets",
		description: "Lets the app permanently remove saved presets.",
		icon: Settings2,
		tone: "delete",
	},
	"settings:read": {
		label: "Read settings",
		description: "Lets the app inspect workspace settings and configuration.",
		icon: Settings2,
		tone: "read",
	},
	"settings:write": {
		label: "Manage settings",
		description: "Lets the app change workspace settings and configuration.",
		icon: Settings2,
		tone: "write",
	},
	"provider_credentials:read": {
		label: "Read provider credentials",
		description: "Lets the app inspect provider credential metadata without revealing secret values.",
		icon: KeyRound,
		tone: "read",
	},
	"provider_credentials:write": {
		label: "Manage provider credentials",
		description: "Lets the app create or update encrypted provider credentials.",
		icon: KeyRound,
		tone: "write",
	},
	"provider_credentials:delete": {
		label: "Delete provider credentials",
		description: "Lets the app permanently remove provider credentials.",
		icon: KeyRound,
		tone: "delete",
	},
	"private_models:read": {
		label: "Read private models",
		description: "Lets the app inspect workspace private-model configuration without revealing credentials.",
		icon: KeyRound,
		tone: "read",
	},
	"private_models:write": {
		label: "Manage private models",
		description: "Lets the app connect or update workspace private-model endpoints.",
		icon: KeyRound,
		tone: "write",
	},
	"private_models:delete": {
		label: "Delete private models",
		description: "Lets the app permanently remove workspace private models.",
		icon: KeyRound,
		tone: "delete",
	},
	"guardrails:read": {
		label: "Read guardrails",
		description: "Lets the app inspect guardrails and policy configuration.",
		icon: Shield,
		tone: "read",
	},
	"guardrails:write": {
		label: "Manage guardrails",
		description: "Lets the app create or update guardrails and policy configuration.",
		icon: Shield,
		tone: "write",
	},
	"guardrails:delete": {
		label: "Delete guardrails",
		description: "Lets the app permanently remove guardrails and policy configuration.",
		icon: Shield,
		tone: "delete",
	},
	"budgets:read": {
		label: "Read budgets",
		description: "Lets the app inspect workspace spend budgets and usage.",
		icon: Settings2,
		tone: "read",
	},
	"budgets:write": {
		label: "Manage budgets",
		description: "Lets the app create or update workspace spend budgets.",
		icon: Settings2,
		tone: "write",
	},
	"budgets:delete": {
		label: "Delete budgets",
		description: "Lets the app permanently remove workspace spend budgets.",
		icon: Settings2,
		tone: "delete",
	},
	"management_keys:read": {
		label: "Read management keys",
		description: "Lets the app inspect machine-level management key metadata.",
		icon: Wrench,
		tone: "read",
	},
	"management_keys:write": {
		label: "Manage management keys",
		description: "Lets the app create or update machine-level management keys.",
		icon: Wrench,
		tone: "write",
	},
	"management_keys:delete": {
		label: "Delete management keys",
		description: "Lets the app permanently revoke machine-level management keys.",
		icon: Wrench,
		tone: "delete",
	},
	"oauth_clients:read": {
		label: "Read OAuth apps",
		description: "Lets the app inspect OAuth client and integration metadata.",
		icon: Lock,
		tone: "read",
	},
	"oauth_clients:write": {
		label: "Manage OAuth apps",
		description: "Lets the app create or update OAuth client configuration.",
		icon: Lock,
		tone: "write",
	},
	"oauth_clients:delete": {
		label: "Delete OAuth apps",
		description: "Lets the app permanently remove OAuth client and integration configuration.",
		icon: Lock,
		tone: "delete",
	},
};

function fallbackScopeMeta(scope: string): ScopeMeta {
	const isDelete = /:delete$/i.test(scope);
	const isWrite = /:write$/i.test(scope);
	return {
		label: scope,
		description: isWrite || isDelete
			? "Lets the app change or manage this resource on your behalf."
			: "Lets the app read or inspect this resource on your behalf.",
		icon: isWrite || isDelete ? Settings2 : Search,
		tone: isDelete ? "delete" : isWrite ? "write" : "read",
	};
}

function scopeToneBadge(tone: ScopeMeta["tone"]) {
	if (tone === "identity") return { label: "Identity", className: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300" };
	if (tone === "delete") return { label: "Delete", className: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" };
	if (tone === "write") return { label: "Write", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" };
	return { label: "Read", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" };
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
	const logoSrc = consentLogoSrc(oauthApp.logo_url);
	const redirectHostname = displayHostname(redirectUri);

	const selectedCount = selectedTeamIds.length;
	const allSelected = selectedCount === teams.length;
	const scopeGroups = useMemo(
		() => groupConsentScopes(requestedScopes).map((group) => ({
			...group,
			scopes: group.scopes.map((scope) => ({
				scope,
				...((SCOPE_META[scope] ?? fallbackScopeMeta(scope)) as ScopeMeta),
			})),
		})),
		[requestedScopes],
	);
	const permissionCount = scopeGroups.reduce((total, group) => total + group.scopes.length, 0);
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
			setError("Confirm that you understand this application has not been verified by Phaseo.");
			return;
		}
		if (!selectedTeamIds.length) {
			setError("Select at least one team to authorize.");
			return;
		}
		if (!primaryTeamId || !selectedTeamIds.includes(primaryTeamId)) {
			setError("Choose which selected team should be active for this login.");
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
				setError(result.error);
				return;
			}

			if (result.data?.redirect_url) {
				if (!isSafeOAuthRedirectUrl(result.data.redirect_url)) {
					setError("The authorization server returned an unsafe redirect URL.");
					return;
				}
				window.location.assign(result.data.redirect_url);
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
					setError("The authorization server returned an unsafe redirect URL.");
					return;
				}
				window.location.assign(result.data.redirect_url);
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
				<div className="flex justify-end">
					<Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-700">
						OAuth Alpha
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
									Official Phaseo app
								</Badge>
							) : null}
						</div>
						<CardDescription className="mt-1">
							wants access to your Phaseo account
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

				{oauthApp.description && (
					<p className="text-sm text-muted-foreground">{oauthApp.description}</p>
				)}
			</CardHeader>

			<CardContent className="space-y-6">
				{isUnverified && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription className="space-y-2">
							<p><strong>Unverified application.</strong> Phaseo has not verified this app&apos;s identity, owner, or branding.</p>
							<div className="font-mono text-xs break-all">Client: {clientId ?? oauthApp.client_id ?? "unknown"}</div>
							{redirectHostname && <div className="text-xs">Authorization returns to: <strong>{redirectHostname}</strong></div>}
							<label className="flex items-start gap-2 pt-1 text-sm">
								<Checkbox
									checked={unverifiedAcknowledged}
									onCheckedChange={(checked) => setUnverifiedAcknowledged(checked === true)}
								/>
								<span>I understand this application is unverified and I trust the redirect destination shown above.</span>
							</label>
						</AlertDescription>
					</Alert>
				)}
				<Alert>
					<Shield className="h-4 w-4" />
					<AlertDescription>
						Authorize only applications you trust. This approval grants access to the selected
						teams, and the active login session will start on one primary team.
					</AlertDescription>
				</Alert>

				<div className="space-y-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<Label>Teams</Label>
							<p className="text-xs text-muted-foreground mt-1">
								Select every team this app may access. Then choose which one should be active
								for this login right now.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button type="button" variant="outline" size="sm" onClick={handleSelectAll} disabled={allSelected} className="rounded-md">
								Select all
							</Button>
							<Button type="button" variant="ghost" size="sm" onClick={handleClearTeams} disabled={!selectedCount} className="rounded-md">
								Clear
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
													? "Selected and active for this login."
													: "Selected for app access."
												: "Not selected."}
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
										{primary ? "Active now" : "Use now"}
									</Button>
								</div>
							);
						})}
					</div>

					<div className="flex items-center justify-between text-xs text-muted-foreground">
						<span>{selectedCount} team{selectedCount === 1 ? "" : "s"} selected</span>
						<span>{primaryTeamId ? "Primary team chosen" : "Choose a primary team"}</span>
					</div>
				</div>

				<div className="space-y-3">
					<div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-end">
						<div>
							<Label>Requested permissions</Label>
							<p className="text-xs text-muted-foreground mt-1">
								Expand a group to review and choose optional permissions. Required permissions
								keep the sign-in or gateway connection working.
							</p>
						</div>
						<p className="shrink-0 text-xs text-muted-foreground sm:text-right">
							{selectedScopes.length} of {permissionCount} selected
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
							return (
								<AccordionItem key={group.key} value={group.key} className="overflow-hidden rounded-md border">
									<AccordionTrigger className="gap-3 px-4 py-3 hover:bg-muted/40">
										<div className="flex min-w-0 flex-1 items-start gap-3">
											<div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
												<GroupIcon className="size-4 text-muted-foreground" />
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center gap-2">
													<span>{group.label}</span>
													<Badge variant="secondary" className="rounded-md font-normal">
														{group.scopes.length}
													</Badge>
													{tones.map((tone) => {
														const badge = scopeToneBadge(tone);
														return (
															<Badge key={tone} variant="outline" className={`${badge.className} rounded-md`}>
																{badge.label}
															</Badge>
														);
													})}
												</div>
												<p className="mt-1 text-xs font-normal text-muted-foreground">
													{group.description}
												</p>
											</div>
										</div>
									</AccordionTrigger>
									<AccordionContent className="space-y-2 px-3 pb-3">
									{group.scopes.map((scopeInfo) => {
										const Icon = scopeInfo.icon;
										const tone = scopeToneBadge(scopeInfo.tone);
										const required = requiredScopes.has(scopeInfo.scope);
										return (
											<label key={scopeInfo.scope} className={`flex items-start gap-3 rounded-md bg-muted/40 p-3 ${required ? "" : "cursor-pointer hover:bg-muted/60"}`}>
												<Checkbox
													checked={selectedScopes.includes(scopeInfo.scope)}
													disabled={required}
													onCheckedChange={(checked) => handleScopeToggle(scopeInfo.scope, checked === true)}
													aria-label={`${selectedScopes.includes(scopeInfo.scope) ? "Allow" : "Do not allow"} ${scopeInfo.label}`}
													className="mt-1"
												/>
												<Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-2">
															<div className="font-medium text-sm">{scopeInfo.label}</div>
														<Badge variant="outline" className={`${tone.className} rounded-md`}>
															{tone.label}
														</Badge>
														{required ? <Badge variant="secondary" className="rounded-md font-normal">Required</Badge> : null}
														</div>
														<div className="text-xs text-muted-foreground mt-1">
															{scopeInfo.description}
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
				<Button variant="outline" onClick={handleDeny} disabled={loading} className="flex-1 rounded-md">
					Deny
				</Button>
				<Button
					onClick={handleApprove}
					disabled={loading || !selectedTeamIds.length || !primaryTeamId || (isUnverified && !unverifiedAcknowledged)}
					className="flex-1 rounded-md"
				>
					{loading ? "Authorizing..." : `Authorize ${selectedScopes.length} permissions`}
				</Button>
			</CardFooter>

			<div className="px-6 pb-6 text-center text-xs text-muted-foreground">
				By authorizing, you grant this application access to the selected teams. You can revoke
				access later from your settings.
			</div>
		</Card>
	);
}
