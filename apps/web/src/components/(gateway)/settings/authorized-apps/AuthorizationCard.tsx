"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useSettingsRouter as useRouter } from "../PrivateSettingsQuery";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { ExternalLink, Calendar, Activity, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import RevokeDialog from "./RevokeDialog";
import ReauthorizeDialog from "./ReauthorizeDialog";
import { oauthScopeLabel } from "@/lib/oauth/scopes";
import { groupConsentScopes } from "@/components/(gateway)/oauth/consentScopeGroups";
import { updateAuthorizationScopesAction } from "@/app/(dashboard)/settings/authorized-apps/actions";
import { toast } from "sonner";

interface AuthorizationCardProps {
	authorization: any;
	userId: string;
}

type ScopeTone = "identity" | "read" | "write" | "delete";

function scopeTone(scope: string): ScopeTone {
	if (["openid", "profile", "email"].includes(scope)) return "identity";
	if (/:delete$/i.test(scope)) return "delete";
	if (scope === "gateway:access" || /:write$/i.test(scope)) return "write";
	return "read";
}

function scopeToneBadge(tone: ScopeTone) {
	if (tone === "identity") return { label: "Identity", className: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300" };
	if (tone === "delete") return { label: "Delete", className: "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300" };
	if (tone === "write") return { label: "Write", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300" };
	return { label: "Read", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300" };
}

export default function AuthorizationCard({ authorization }: AuthorizationCardProps) {
	const isPhaseoCli = authorization.app_name === "Phaseo CLI";
	const grantedScopes: string[] = Array.isArray(authorization.scopes)
		? authorization.scopes.filter((scope: unknown): scope is string => typeof scope === "string")
		: [];
	const [editingScopes, setEditingScopes] = useState(false);
	const [selectedScopes, setSelectedScopes] = useState<string[]>(grantedScopes);
	const [savingScopes, setSavingScopes] = useState(false);
	const router = useRouter();
	const additionalScopes: string[] = Array.isArray(authorization.additional_scopes)
		? authorization.additional_scopes.filter((scope: unknown): scope is string => typeof scope === "string")
		: [];
	const scopeGroups = groupConsentScopes(
		grantedScopes,
	);
	const additionalScopeGroups = groupConsentScopes(additionalScopes);
	const hasScopeChanges = selectedScopes.length !== grantedScopes.length;

	const toggleScope = (scope: string, checked: boolean) => {
		setSelectedScopes((current) => checked
			? Array.from(new Set([...current, scope]))
			: current.filter((value) => value !== scope));
	};

	const cancelScopeEditing = () => {
		setSelectedScopes(grantedScopes);
		setEditingScopes(false);
	};

	const saveScopes = async () => {
		if (selectedScopes.length === 0) return;
		setSavingScopes(true);
		const result = await updateAuthorizationScopesAction(
			authorization.authorization_id,
			selectedScopes,
		);
		setSavingScopes(false);
		if (result.error) {
			toast.error(result.error);
			return;
		}
		toast.success("Permissions updated");
		setEditingScopes(false);
		router.refresh();
	};

	return (
		<Card className="min-w-0 gap-3 overflow-hidden">
			<CardHeader>
				<div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 flex-1 items-start gap-3">
						{isPhaseoCli ? (
							<div className="flex size-12 shrink-0 items-center justify-center rounded-md border bg-background p-2">
								<Image src="/logo_light.svg" alt="" width={32} height={32} className="size-full object-contain dark:hidden" />
								<Image src="/logo_dark.svg" alt="" width={32} height={32} className="hidden size-full object-contain dark:block" />
							</div>
						) : authorization.app_logo_url ? (
							<img
								src={authorization.app_logo_url}
								alt={authorization.app_name}
								className="size-12 rounded-md object-cover border shrink-0"
							/>
						) : (
							<div className="size-12 rounded-md border bg-muted flex items-center justify-center shrink-0">
								<Activity className="size-6 text-muted-foreground" />
							</div>
						)}
						<div className="min-w-0 flex-1">
							<CardTitle className="line-clamp-2 wrap-break-word text-lg">
								{authorization.app_homepage_url ? (
									<a
										href={authorization.app_homepage_url}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex max-w-full items-center gap-1.5 underline decoration-transparent underline-offset-4 transition-colors hover:text-primary hover:decoration-current"
									>
										<span className="truncate">{authorization.app_name}</span>
										<ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
									</a>
								) : authorization.app_name}
							</CardTitle>
							<CardDescription className="mt-1 wrap-break-word">
								{authorization.app_description || "No description provided"}
							</CardDescription>
							{authorization.app_is_identified === false && authorization.app_client_id && (
								<p className="mt-1 break-all font-mono text-xs text-muted-foreground">
									Client {authorization.app_client_id}
								</p>
							)}
						</div>
					</div>
					<div className="flex w-full gap-2 sm:w-auto">
						<ReauthorizeDialog
							authorizationId={authorization.authorization_id}
							appName={authorization.app_name}
							homepageUrl={authorization.app_homepage_url}
							currentScopes={grantedScopes}
							additionalScopes={additionalScopes}
						/>
						<RevokeDialog
							authorizationId={authorization.authorization_id}
							appName={authorization.app_name}
						/>
					</div>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Scopes */}
				<Accordion type="single" collapsible className="rounded-md border">
					<AccordionItem value="permissions" className="border-0">
						<AccordionTrigger className="gap-3 px-3 py-3 hover:bg-muted/40">
							<div className="min-w-0 flex-1 text-left">
								<div className="text-sm font-medium">Permissions</div>
								<p className="mt-0.5 text-xs font-normal text-muted-foreground">
									{scopeGroups.length} group{scopeGroups.length === 1 ? "" : "s"} /{" "}
									{scopeGroups.reduce((total, group) => total + group.scopes.length, 0)} permissions
								</p>
							</div>
						</AccordionTrigger>
						<AccordionContent className="px-3 pb-3">
							<div className="mb-3 flex flex-col gap-2 rounded-md bg-muted/35 p-2.5 sm:flex-row sm:items-center sm:justify-between">
								<p className="text-xs text-muted-foreground">
									{editingScopes
										? "Deselect permissions to reduce this app's access. New access requires authorization through the app."
										: "You can reduce this app's access without revoking it entirely."}
								</p>
								{editingScopes ? (
									<div className="flex shrink-0 gap-2">
										<Button type="button" size="sm" variant="ghost" className="rounded-md" disabled={savingScopes} onClick={cancelScopeEditing}>
											Cancel
										</Button>
										<Button type="button" size="sm" className="rounded-md" disabled={savingScopes || selectedScopes.length === 0 || !hasScopeChanges} onClick={saveScopes}>
											{savingScopes ? "Saving..." : "Save changes"}
										</Button>
									</div>
								) : (
									<Button type="button" size="sm" variant="outline" className="shrink-0 rounded-md" onClick={() => setEditingScopes(true)}>
										Manage permissions
									</Button>
								)}
							</div>
							<Accordion
								type="multiple"
								defaultValue={scopeGroups.some((group) => group.key === "identity") ? ["identity"] : []}
								className="gap-2"
							>
								{scopeGroups.map((group) => {
									const tones = Array.from(new Set(group.scopes.map(scopeTone)));
									return (
										<AccordionItem key={group.key} value={group.key} className="overflow-hidden rounded-md border">
											<AccordionTrigger className="gap-3 px-3 py-2.5 hover:bg-muted/40">
												<div className="min-w-0 flex-1 text-left">
													<div className="flex flex-wrap items-center gap-1.5">
														<span className="mr-0.5 truncate text-sm">{group.label}</span>
														<Badge variant="secondary" className="rounded-md font-normal">
															{group.scopes.length}
														</Badge>
														{tones.map((tone) => {
															const badge = scopeToneBadge(tone);
															return (
																<Badge key={tone} variant="outline" className={`${badge.className} rounded-md font-normal`}>
																	{badge.label}
																</Badge>
															);
														})}
													</div>
													<p className="mt-0.5 line-clamp-2 text-xs font-normal text-muted-foreground">
														{group.description}
													</p>
												</div>
											</AccordionTrigger>
											<AccordionContent className="space-y-1 px-3 pb-3 pt-2">
											{group.scopes.map((scope) => {
												const badge = scopeToneBadge(scopeTone(scope));
												const row = (
													<>
														<div className="flex min-w-0 items-center gap-2">
															{editingScopes ? (
																<Checkbox
																	checked={selectedScopes.includes(scope)}
																	onCheckedChange={(checked) => toggleScope(scope, checked === true)}
																	aria-label={`Allow ${oauthScopeLabel(scope)}`}
																/>
															) : null}
															<span className="min-w-0 break-words text-xs font-medium">{oauthScopeLabel(scope)}</span>
														</div>
														<Badge variant="outline" className={`${badge.className} shrink-0 rounded-md font-normal`}>
															{badge.label}
														</Badge>
													</>
												);
												return editingScopes ? (
													<label key={scope} className="flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 hover:bg-muted/60">
														{row}
													</label>
												) : (
													<div key={scope} className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
														{row}
													</div>
												);
												})}
											</AccordionContent>
										</AccordionItem>
									);
								})}
							</Accordion>
						</AccordionContent>
					</AccordionItem>
				</Accordion>

				{additionalScopes.length > 0 ? (
					<div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
						<div className="flex items-start gap-2">
							<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
							<div className="min-w-0 space-y-2">
								<div className="text-sm font-medium text-amber-900 dark:text-amber-100">Additional permissions available</div>
								<p className="text-xs text-amber-800 dark:text-amber-200">
									This app can now request more permissions. Your existing access has not changed; use Reauthorize above to start a new request from the app.
								</p>
								<div className="space-y-2">
									{additionalScopeGroups.map((group) => (
										<div key={group.key} className="rounded-md border border-amber-300/70 p-2 dark:border-amber-800/70">
											<div className="mb-1.5 text-xs font-medium text-amber-900 dark:text-amber-100">
												{group.label}
											</div>
											<div className="flex flex-wrap gap-1.5">
												{group.scopes.map((scope) => {
													const badge = scopeToneBadge(scopeTone(scope));
													return (
														<Badge key={scope} variant="outline" className={`${badge.className} max-w-full rounded-md whitespace-normal break-words text-left text-xs font-normal`}>
															{oauthScopeLabel(scope)} · {badge.label}
														</Badge>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						</div>
					</div>
				) : null}

				{/* Metadata */}
				<div className="grid grid-cols-3 gap-3 border-t pt-4 text-sm">
					<div className="min-w-0">
						<div className="mb-1 text-xs font-medium text-foreground">Team</div>
						<div className="truncate text-xs text-muted-foreground" title={authorization.team_name}>
							{authorization.team_name}
						</div>
					</div>
					<div>
						<div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
							<Calendar className="size-3" />
							<span>Authorized</span>
						</div>
						<div className="text-xs font-medium leading-snug">
							{formatDistanceToNow(new Date(authorization.authorized_at), {
								addSuffix: true,
							})}
						</div>
					</div>
					<div>
						<div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
							<Activity className="size-3" />
							<span>Last Used</span>
						</div>
						<div className="text-xs font-medium leading-snug">
							{authorization.last_used_at
								? formatDistanceToNow(new Date(authorization.last_used_at), {
										addSuffix: true,
									})
								: "Never"}
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
