"use client";

import { useState, useTransition, type ReactNode } from "react";
import { FingerprintPattern, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
	createTrustedWorkload,
	deleteTrustedWorkload,
	setTrustedWorkloadStatus,
	updateTrustedWorkload,
	type TrustedWorkloadActionError,
} from "@/app/(dashboard)/settings/trusted-workloads/actions";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Checkbox } from "@/components/ui/checkbox";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
	SettingsWorkloadIdentityInitialData,
	SettingsWorkloadIdentityPolicy,
	SettingsWorkloadIdentityProvider,
} from "@/lib/fetchers/internal/settingsTypes";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import {
	MAX_LIFETIME_HOURS,
	MAX_NAME_LENGTH,
	VERCEL_ENVIRONMENTS,
	draftFromPolicy,
	draftToPayload,
	emptyWorkloadDraft,
	githubActionsSnippet,
	isOwnerWide,
	toUpdatePayload,
	vercelSnippet,
	type WorkloadDraft,
	type WorkloadProblem,
} from "./trustedWorkloadForm";

type Data = SettingsWorkloadIdentityInitialData;
type EditorState = { mode: "create" } | { mode: "edit"; policy: SettingsWorkloadIdentityPolicy } | null;
const PROVIDERS: SettingsWorkloadIdentityProvider[] = ["vercel", "github_actions"];

function Notice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function useActionError() {
	const t = useTranslations("SettingsUI.trustedWorkloads");
	return (result: TrustedWorkloadActionError, fallback: string) => result.message ? t("errors.invalid", { message: result.message }) : fallback;
}

export default function TrustedWorkloadsSettingsClient({ data }: { data: Data }) {
	const t = useTranslations("SettingsUI.trustedWorkloads");
	const [editor, setEditor] = useState<EditorState>(null);
	if (!data.workspaceId) return <Notice>{t("selectWorkspace")}</Notice>;
	if (!data.available) return <Notice>{t("unavailable")}</Notice>;
	if (!data.canManage) return <Notice>{t("adminsOnly")}</Notice>;
	return (
		<div className="space-y-8">
			<Callout>{t("howItWorks")}</Callout>
			<section className="space-y-3">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<h2 className="text-base font-semibold">{t("policiesTitle")}</h2>
						<p className="mt-1 text-sm text-muted-foreground">{t("propagation")}</p>
					</div>
					<Button type="button" className="rounded-md" onClick={() => setEditor({ mode: "create" })}>
						<Plus className="h-4 w-4" />
						{t("newPolicy")}
					</Button>
				</div>
				{data.policies.length ? (
					<ul className="divide-y rounded-md border">
						{data.policies.map((policy) => <PolicyRow key={policy.id} policy={policy} onEdit={() => setEditor({ mode: "edit", policy })} />)}
					</ul>
				) : (
					<Empty className="rounded-md border border-dashed p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon"><FingerprintPattern className="h-5 w-5" /></EmptyMedia>
							<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
							<EmptyDescription>{t("emptyBody")}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</section>
			<UsageSection audience={data.audience} />
			{editor ? <PolicyDialog key={editor.mode === "edit" ? editor.policy.id : "new"} state={editor} onClose={() => setEditor(null)} /> : null}
		</div>
	);
}

function conditionSummary(t: ReturnType<typeof useTranslations<"SettingsUI.trustedWorkloads">>, policy: SettingsWorkloadIdentityPolicy): string {
	const conditions = policy.claimConditions ?? {};
	const parts: string[] = [];
	for (const [claim, values] of Object.entries(conditions)) {
		if (!values?.length) continue;
		const label = claim === "project_id" ? t("fields.vercelProjectId")
			: claim === "repository_id" ? t("fields.githubRepositoryId")
			: claim === "environment" ? t("fields.environment")
			: claim === "ref" ? t("listRef")
			: claim;
		parts.push(`${label}: ${values.join(", ")}`);
	}
	return parts.length ? parts.join(" · ") : t("noConditions");
}

function PolicyRow({ policy, onEdit }: { policy: SettingsWorkloadIdentityPolicy; onEdit: () => void }) {
	const t = useTranslations("SettingsUI.trustedWorkloads");
	const format = useFormatter();
	const actionError = useActionError();
	const write = useSettingsWrite();
	const [confirming, setConfirming] = useState(false);
	const [pending, startPending] = useTransition();
	const active = policy.status === "active";

	function toggle(next: boolean) {
		startPending(async () => {
			const result = await write(setTrustedWorkloadStatus(policy.id, next ? "active" : "disabled"));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.saveFailed")));
				return;
			}
			toast.success(next ? t("toasts.enabled") : t("toasts.disabled"));
		});
	}

	function remove() {
		startPending(async () => {
			const result = await write(deleteTrustedWorkload(policy.id));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.deleteFailed")));
				return;
			}
			setConfirming(false);
			toast.success(t("toasts.deleted"));
		});
	}

	return (
		<li className="space-y-3 px-4 py-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="truncate text-base font-semibold">{policy.name}</p>
						<Badge variant="outline">{t(`providers.${policy.provider}`)}</Badge>
						{active ? null : <Badge variant="secondary">{t("disabled")}</Badge>}
					</div>
					{isOwnerWide(policy) ? <p className="mt-1 text-xs text-muted-foreground">{t(`ownerWide.${policy.provider}`)}</p> : null}
				</div>
				<div className="flex items-center gap-2">
					<Switch checked={active} disabled={pending} onCheckedChange={toggle} aria-label={t("enabledLabel", { name: policy.name })} />
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={onEdit}>{t("edit")}</Button>
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => setConfirming(true)}>{t("delete")}</Button>
				</div>
			</div>
			<dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
				<div className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted-foreground">{t("listIssuer")}</dt><dd className="truncate font-mono">{policy.issuer}</dd></div>
				<div className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted-foreground">{t(`ownerLabel.${policy.provider}`)}</dt><dd className="truncate font-mono">{policy.ownerId}</dd></div>
				<div className="flex min-w-0 gap-2 sm:col-span-2"><dt className="shrink-0 text-muted-foreground">{t("listConditions")}</dt><dd className="break-all">{conditionSummary(t, policy)}</dd></div>
				<div className="flex gap-2"><dt className="text-muted-foreground">{t("listLastUsed")}</dt><dd>
					{policy.lastUsedAt ? format.relativeTime(new Date(policy.lastUsedAt)) : t("neverUsed")}
				</dd></div>
				<div className="flex gap-2"><dt className="text-muted-foreground">{t("listLifetime")}</dt><dd>
					{t("lifetimeHours", { count: Math.round(policy.maxTokenLifetimeSeconds / 3600) })}
				</dd></div>
			</dl>
			<AlertDialog open={confirming} onOpenChange={(open) => { if (!pending) setConfirming(open); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("deleteTitle", { name: policy.name })}</AlertDialogTitle>
						<AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); remove(); }}>{t("delete")}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</li>
	);
}

function PolicyDialog({ state, onClose }: { state: Exclude<EditorState, null>; onClose: () => void }) {
	const t = useTranslations("SettingsUI.trustedWorkloads");
	const actionError = useActionError();
	const write = useSettingsWrite();
	const existing = state.mode === "edit" ? state.policy : null;
	const [draft, setDraft] = useState<WorkloadDraft>(() => existing ? draftFromPolicy(existing) : emptyWorkloadDraft());
	const [problem, setProblem] = useState<WorkloadProblem | null>(null);
	const [saving, startSaving] = useTransition();
	const set = <K extends keyof WorkloadDraft>(field: K, value: WorkloadDraft[K]) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
	};
	const vercel = draft.provider === "vercel";

	function save() {
		const built = draftToPayload(draft);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		startSaving(async () => {
			const result = existing
				? await write(updateTrustedWorkload(existing.id, toUpdatePayload(built.payload)))
				: await write(createTrustedWorkload(built.payload));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.saveFailed")));
				return;
			}
			toast.success(existing ? t("toasts.saved") : t("toasts.created"));
			onClose();
		});
	}

	const field = (name: WorkloadProblem) => problem === name ? <p className="text-xs text-destructive">{t(`problems.${name}`)}</p> : null;
	// Provider, issuer and owner identify what is trusted, so they are fixed once saved.
	const locked = Boolean(existing);
	return (
		<Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
			<DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{existing ? t("dialogEditTitle", { name: existing.name }) : t("dialogCreateTitle")}</DialogTitle>
					<DialogDescription>{t("propagation")}</DialogDescription>
				</DialogHeader>
				<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
					<div className="space-y-1.5">
						<Label htmlFor="workload-name">{t("fields.name")}</Label>
						<Input id="workload-name" value={draft.name} maxLength={MAX_NAME_LENGTH} placeholder={t("fields.namePlaceholder")} onChange={(event) => set("name", event.target.value)} aria-invalid={problem === "name"} />
						{field("name")}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="workload-provider">{t("fields.provider")}</Label>
						<Select value={draft.provider} disabled={locked} onValueChange={(value) => setDraft({ ...emptyWorkloadDraft(value as SettingsWorkloadIdentityProvider), name: draft.name })}>
							<SelectTrigger id="workload-provider" className="w-full rounded-md"><SelectValue>{t(`providers.${draft.provider}`)}</SelectValue></SelectTrigger>
							<SelectContent>
								{PROVIDERS.map((provider) => <SelectItem key={provider} value={provider}>{t(`providers.${provider}`)}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					{vercel ? (
						<>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="workload-team-slug">{t("fields.vercelTeamSlug")}</Label>
									<Input id="workload-team-slug" value={draft.vercelTeamSlug} disabled={locked} placeholder="acme" onChange={(event) => set("vercelTeamSlug", event.target.value)} aria-invalid={problem === "vercelTeamSlug"} />
									{field("vercelTeamSlug")}
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="workload-team-id">{t("fields.vercelTeamId")}</Label>
									<Input id="workload-team-id" value={draft.ownerId} disabled={locked} placeholder="team_…" className="font-mono" onChange={(event) => set("ownerId", event.target.value)} aria-invalid={problem === "vercelTeamId"} />
									{field("vercelTeamId")}
								</div>
							</div>
							<p className="text-xs text-muted-foreground">{t("fields.vercelTeamHint")}</p>
							<div className="space-y-1.5">
								<Label htmlFor="workload-project-id">{t("fields.vercelProjectId")}</Label>
								<Input id="workload-project-id" value={draft.vercelProjectId} placeholder="prj_…" className="font-mono" onChange={(event) => set("vercelProjectId", event.target.value)} aria-invalid={problem === "vercelProjectId"} />
								{field("vercelProjectId")}
								<p className="text-xs text-muted-foreground">{t("fields.vercelProjectHint")}</p>
							</div>
							<fieldset className="space-y-2">
								<legend className="text-sm font-medium">{t("fields.environment")}</legend>
								<div className="flex flex-wrap gap-x-5 gap-y-2">
									{VERCEL_ENVIRONMENTS.map((environment) => (
										<label key={environment} className="flex items-center gap-2 text-sm">
											<Checkbox
												checked={draft.vercelEnvironments.includes(environment)}
												onCheckedChange={(checked) => set("vercelEnvironments", checked
													? [...draft.vercelEnvironments, environment]
													: draft.vercelEnvironments.filter((value) => value !== environment))}
											/>
											{t(`environments.${environment}`)}
										</label>
									))}
								</div>
								<p className="text-xs text-muted-foreground">{t("fields.environmentHint")}</p>
							</fieldset>
						</>
					) : (
						<>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="workload-github-owner">{t("fields.githubOwnerId")}</Label>
									<Input id="workload-github-owner" value={draft.ownerId} disabled={locked} inputMode="numeric" placeholder="123456" className="font-mono" onChange={(event) => set("ownerId", event.target.value)} aria-invalid={problem === "githubOwnerId"} />
									{field("githubOwnerId")}
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="workload-github-repository">{t("fields.githubRepositoryId")}</Label>
									<Input id="workload-github-repository" value={draft.githubRepositoryId} inputMode="numeric" placeholder="456789" className="font-mono" onChange={(event) => set("githubRepositoryId", event.target.value)} aria-invalid={problem === "githubRepositoryId"} />
									{field("githubRepositoryId")}
								</div>
							</div>
							<p className="text-xs text-muted-foreground">{t("fields.githubIdsHint")}</p>
							<div className="grid gap-4 sm:grid-cols-2">
								<div className="space-y-1.5">
									<Label htmlFor="workload-github-ref">{t("fields.githubRef")}</Label>
									<Input id="workload-github-ref" value={draft.githubRef} placeholder="refs/heads/main" className="font-mono" onChange={(event) => set("githubRef", event.target.value)} />
								</div>
								<div className="space-y-1.5">
									<Label htmlFor="workload-github-environment">{t("fields.environment")}</Label>
									<Input id="workload-github-environment" value={draft.githubEnvironment} placeholder="production" onChange={(event) => set("githubEnvironment", event.target.value)} />
								</div>
							</div>
						</>
					)}
					<div className="space-y-1.5">
						<Label htmlFor="workload-lifetime">{t("fields.lifetime")}</Label>
						<Input id="workload-lifetime" inputMode="numeric" className="w-24" value={draft.maxLifetimeHours} onChange={(event) => set("maxLifetimeHours", event.target.value)} aria-invalid={problem === "lifetime"} />
						{field("lifetime")}
						<p className="text-xs text-muted-foreground">{t("fields.lifetimeHint", { max: MAX_LIFETIME_HOURS })}</p>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" className="rounded-md" disabled={saving} onClick={onClose}>{t("cancel")}</Button>
						<Button type="submit" className="rounded-md" disabled={saving}>{existing ? t("save") : t("create")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Snippet({ title, code }: { title: string; code: string }) {
	return (
		<div className="min-w-0 space-y-1.5">
			<div className="flex items-center justify-between gap-2">
				<p className="text-sm font-medium">{title}</p>
				<CopyButton content={code} variant="ghost" size="sm" aria-label={title} />
			</div>
			<pre className="overflow-x-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs leading-relaxed">{code}</pre>
		</div>
	);
}

function UsageSection({ audience }: { audience: string }) {
	const t = useTranslations("SettingsUI.trustedWorkloads");
	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-base font-semibold">{t("usageTitle")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("usageBody")}</p>
				<code className="mt-2 inline-block rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">Authorization: Bearer &lt;token&gt;</code>
			</div>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-muted-foreground">{t("audienceLabel")}</span>
				<code className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-xs">{audience}</code>
				<CopyButton content={audience} variant="ghost" size="sm" aria-label={t("audienceLabel")} />
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<Snippet title={t("providers.vercel")} code={vercelSnippet(audience)} />
				<Snippet title={t("providers.github_actions")} code={githubActionsSnippet(audience)} />
			</div>
		</section>
	);
}
