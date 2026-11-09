import { useState, useTransition, type ReactNode } from "react";
import { FingerprintPattern, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "@/i18n/react";
import { toast } from "sonner";
import {
	createTrustedWorkload,
	deleteTrustedWorkload,
	setTrustedWorkloadStatus,
	updateTrustedWorkload,
	type TrustedWorkloadActionError,
} from "@/features/settings/trusted-workloads/actions";
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
	WORKLOAD_PROVIDERS,
	draftFromPolicy,
	draftToPayload,
	emptyWorkloadDraft,
	isOwnerWide,
	policyOwnerClaim,
	toUpdatePayload,
	tokenSnippet,
	type WorkloadDraft,
	type WorkloadProblem,
} from "./trustedWorkloadForm";

type Data = SettingsWorkloadIdentityInitialData;
type EditorState = { mode: "create" } | { mode: "edit"; policy: SettingsWorkloadIdentityPolicy } | null;
type Translate = ReturnType<typeof useTranslations<"SettingsUI.trustedWorkloads">>;
type MessageKey = Parameters<Translate>[0];

/** Where a text field's value lives in the draft. */
type FieldTarget = "issuer" | "ownerClaim" | "ownerId" | "customClaim" | "customValue" | { claim: string };
type FieldSpec = {
	id: string;
	target: FieldTarget;
	label: MessageKey;
	placeholder: string;
	problem?: WorkloadProblem;
	/** Identifiers and URLs read better in a monospace font. */
	mono?: boolean;
	numeric?: boolean;
};
/** One line of the form: up to two fields side by side, with an optional hint underneath. */
type FieldRow = { fields: FieldSpec[]; hint?: MessageKey };

// What each platform's policy asks for. Issuer and owner fields identify what is
// trusted, so they lock once the policy is saved.
const PROVIDER_FIELDS: Record<SettingsWorkloadIdentityProvider, FieldRow[]> = {
	vercel: [
		{
			fields: [
				{ id: "team-slug", target: "issuer", label: "fields.vercelTeamSlug", placeholder: "acme", problem: "vercelTeamSlug" },
				{ id: "team-id", target: "ownerId", label: "fields.vercelTeamId", placeholder: "team_…", problem: "vercelTeamId", mono: true },
			],
			hint: "fields.vercelTeamHint",
		},
		{ fields: [{ id: "project-id", target: { claim: "project_id" }, label: "fields.vercelProjectId", placeholder: "prj_…", problem: "vercelProjectId", mono: true }], hint: "fields.vercelProjectHint" },
	],
	github_actions: [
		{
			fields: [
				{ id: "github-owner", target: "ownerId", label: "fields.githubOwnerId", placeholder: "123456", problem: "githubOwnerId", mono: true, numeric: true },
				{ id: "github-repository", target: { claim: "repository_id" }, label: "fields.githubRepositoryId", placeholder: "456789", problem: "githubRepositoryId", mono: true, numeric: true },
			],
			hint: "fields.githubIdsHint",
		},
		{
			fields: [
				{ id: "github-ref", target: { claim: "ref" }, label: "fields.githubRef", placeholder: "refs/heads/main", mono: true },
				{ id: "github-environment", target: { claim: "environment" }, label: "fields.environment", placeholder: "production" },
			],
		},
	],
	gitlab: [
		{ fields: [{ id: "gitlab-project", target: "ownerId", label: "fields.gitlabProjectId", placeholder: "12345678", problem: "gitlabProjectId", mono: true, numeric: true }], hint: "fields.gitlabProjectHint" },
		{
			fields: [
				{ id: "gitlab-ref", target: { claim: "ref" }, label: "fields.gitlabRef", placeholder: "main", mono: true },
				{ id: "gitlab-environment", target: { claim: "environment" }, label: "fields.environmentOptional", placeholder: "production" },
			],
			hint: "fields.gitlabConditionsHint",
		},
	],
	google_cloud: [
		{ fields: [{ id: "google-account", target: "ownerId", label: "fields.googleServiceAccountId", placeholder: "104523456789012345678", problem: "googleServiceAccountId", mono: true, numeric: true }], hint: "fields.googleServiceAccountHint" },
		{ fields: [{ id: "google-email", target: { claim: "email" }, label: "fields.googleServiceAccountEmail", placeholder: "app@project.iam.gserviceaccount.com", problem: "googleServiceAccountEmail", mono: true }], hint: "fields.googleEmailHint" },
	],
	buildkite: [
		{ fields: [{ id: "buildkite-organization", target: "ownerId", label: "fields.buildkiteOrganizationId", placeholder: "0b9f7c5e-…", problem: "buildkiteOrganizationId", mono: true }], hint: "fields.buildkiteOrganizationHint" },
		{ fields: [{ id: "buildkite-pipeline", target: { claim: "pipeline_slug" }, label: "fields.buildkitePipelineSlug", placeholder: "deploy", mono: true }], hint: "fields.buildkitePipelineHint" },
	],
	circleci: [
		{ fields: [{ id: "circleci-organization", target: "ownerId", label: "fields.circleciOrganizationId", placeholder: "0b9f7c5e-…", problem: "circleciOrganizationId", mono: true }], hint: "fields.circleciOrganizationHint" },
		{ fields: [{ id: "circleci-project", target: { claim: "oidc.circleci.com/project-id" }, label: "fields.circleciProjectId", placeholder: "4c2d9e1a-…", problem: "circleciProjectId", mono: true }], hint: "fields.circleciProjectHint" },
	],
	aws: [
		{ fields: [{ id: "aws-issuer", target: "issuer", label: "fields.awsIssuer", placeholder: "https://….tokens.sts.global.api.aws", problem: "awsIssuer", mono: true }], hint: "fields.awsIssuerHint" },
		{ fields: [{ id: "aws-role", target: "ownerId", label: "fields.awsRoleArn", placeholder: "arn:aws:iam::123456789012:role/…", problem: "awsRoleArn", mono: true }], hint: "fields.awsRoleHint" },
	],
	custom: [
		{ fields: [{ id: "custom-issuer", target: "issuer", label: "fields.customIssuer", placeholder: "https://oidc.example.com", problem: "customIssuer", mono: true }], hint: "fields.customIssuerHint" },
		{
			fields: [
				{ id: "custom-owner-claim", target: "ownerClaim", label: "fields.customOwnerClaim", placeholder: "sub", problem: "customOwnerClaim", mono: true },
				{ id: "custom-owner", target: "ownerId", label: "fields.customOwnerId", placeholder: "system:serviceaccount:default:app", problem: "customOwnerId", mono: true },
			],
			hint: "fields.customOwnerHint",
		},
		{
			fields: [
				{ id: "custom-claim", target: "customClaim", label: "fields.customConditionClaim", placeholder: "environment", problem: "customCondition", mono: true },
				{ id: "custom-value", target: "customValue", label: "fields.customConditionValue", placeholder: "production", mono: true },
			],
			hint: "fields.customConditionHint",
		},
	],
};

// Labels for conditions in the policy list; other claims show their own name.
const CONDITION_LABELS: Record<string, MessageKey> = {
	project_id: "fields.vercelProjectId",
	repository_id: "fields.githubRepositoryId",
	environment: "fields.environment",
	ref: "listRef",
	pipeline_slug: "listPipeline",
	email: "listEmail",
	"oidc.circleci.com/project-id": "fields.vercelProjectId",
};
const OWNER_WIDE: Partial<Record<SettingsWorkloadIdentityProvider, MessageKey>> = {
	vercel: "ownerWide.vercel",
	github_actions: "ownerWide.github_actions",
	buildkite: "ownerWide.buildkite",
	circleci: "ownerWide.circleci",
};
const OWNER_LABELS: Record<Exclude<SettingsWorkloadIdentityProvider, "custom">, MessageKey> = {
	vercel: "ownerLabel.vercel",
	github_actions: "ownerLabel.github_actions",
	gitlab: "ownerLabel.gitlab",
	google_cloud: "ownerLabel.google_cloud",
	buildkite: "ownerLabel.buildkite",
	circleci: "ownerLabel.circleci",
	aws: "ownerLabel.aws",
};
const LOCKED_TARGETS = new Set<FieldTarget>(["issuer", "ownerClaim", "ownerId"]);

function readField(draft: WorkloadDraft, target: FieldTarget): string {
	return typeof target === "string" ? draft[target] : draft.conditions[target.claim] ?? "";
}

function writeField(draft: WorkloadDraft, target: FieldTarget, value: string): WorkloadDraft {
	return typeof target === "string" ? { ...draft, [target]: value } : { ...draft, conditions: { ...draft.conditions, [target.claim]: value } };
}

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
			<UsageSection audience={data.audience} initialProvider={data.policies[0]?.provider ?? "vercel"} />
			{editor ? <PolicyDialog key={editor.mode === "edit" ? editor.policy.id : "new"} state={editor} onClose={() => setEditor(null)} /> : null}
		</div>
	);
}

function conditionSummary(t: Translate, policy: SettingsWorkloadIdentityPolicy): string {
	const conditions = policy.claimConditions ?? {};
	const parts: string[] = [];
	for (const [claim, values] of Object.entries(conditions)) {
		if (!values?.length) continue;
		// Custom issuers name their own claims, so show those as they are.
		const key = policy.provider === "custom" ? undefined : CONDITION_LABELS[claim];
		parts.push(`${key ? t(key) : claim}: ${values.join(", ")}`);
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
	const ownerWide = OWNER_WIDE[policy.provider];

	function toggle(next: boolean) {
		startPending(async () => {
			const result = await write(setTrustedWorkloadStatus({ data: { id: policy.id, status: next ? "active" : "disabled" } }));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.saveFailed")));
				return;
			}
			toast.success(next ? t("toasts.enabled") : t("toasts.disabled"));
		});
	}

	function remove() {
		startPending(async () => {
			const result = await write(deleteTrustedWorkload({ data: policy.id }));
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
					{ownerWide && isOwnerWide(policy) ? <p className="mt-1 text-xs text-muted-foreground">{t(ownerWide)}</p> : null}
				</div>
				<div className="flex items-center gap-2">
					<Switch checked={active} disabled={pending} onCheckedChange={toggle} aria-label={t("enabledLabel", { name: policy.name })} />
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={onEdit}>{t("edit")}</Button>
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => setConfirming(true)}>{t("delete")}</Button>
				</div>
			</div>
			<dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
				<div className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted-foreground">{t("listIssuer")}</dt><dd className="truncate font-mono">{policy.issuer}</dd></div>
				<div className="flex min-w-0 gap-2"><dt className="shrink-0 text-muted-foreground">{policy.provider === "custom" ? policyOwnerClaim(policy) : t(OWNER_LABELS[policy.provider])}</dt><dd className="truncate font-mono">{policy.ownerId}</dd></div>
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
	const update = (next: WorkloadDraft) => {
		setDraft(next);
		setProblem(null);
	};

	function save() {
		const built = draftToPayload(draft);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		startSaving(async () => {
			const result = existing
				? await write(updateTrustedWorkload({ data: { id: existing.id, payload: toUpdatePayload(built.payload) } }))
				: await write(createTrustedWorkload({ data: built.payload }));
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
								{WORKLOAD_PROVIDERS.map((provider) => <SelectItem key={provider} value={provider}>{t(`providers.${provider}`)}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					{PROVIDER_FIELDS[draft.provider].map((row) => (
						<div key={row.fields[0].id} className="space-y-1.5">
							<div className={row.fields.length > 1 ? "grid gap-4 sm:grid-cols-2" : undefined}>
								{row.fields.map((spec) => (
									<div key={spec.id} className="min-w-0 space-y-1.5">
										<Label htmlFor={`workload-${spec.id}`}>{t(spec.label)}</Label>
										<Input
											id={`workload-${spec.id}`}
											value={readField(draft, spec.target)}
											disabled={locked && LOCKED_TARGETS.has(spec.target)}
											placeholder={spec.placeholder}
											inputMode={spec.numeric ? "numeric" : undefined}
											autoComplete="off"
											spellCheck={false}
											className={spec.mono ? "font-mono" : undefined}
											onChange={(event) => update(writeField(draft, spec.target, event.target.value))}
											aria-invalid={spec.problem !== undefined && problem === spec.problem}
										/>
										{spec.problem ? field(spec.problem) : null}
									</div>
								))}
							</div>
							{row.hint ? <p className="text-xs text-muted-foreground">{t(row.hint)}</p> : null}
						</div>
					))}
					{draft.provider === "vercel" ? (
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
					) : null}
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

function UsageSection({ audience, initialProvider }: { audience: string; initialProvider: SettingsWorkloadIdentityProvider }) {
	const t = useTranslations("SettingsUI.trustedWorkloads");
	const [provider, setProvider] = useState(initialProvider);
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
			<div className="space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<Label htmlFor="workload-usage-provider" className="text-sm text-muted-foreground">{t("fields.provider")}</Label>
					<Select value={provider} onValueChange={(value) => setProvider(value as SettingsWorkloadIdentityProvider)}>
						<SelectTrigger id="workload-usage-provider" className="w-56 rounded-md"><SelectValue>{t(`providers.${provider}`)}</SelectValue></SelectTrigger>
						<SelectContent>
							{WORKLOAD_PROVIDERS.map((option) => <SelectItem key={option} value={option}>{t(`providers.${option}`)}</SelectItem>)}
						</SelectContent>
					</Select>
				</div>
				{provider === "custom" ? <p className="text-xs text-muted-foreground">{t("usageCustomHint")}</p> : null}
				<Snippet title={t(`providers.${provider}`)} code={tokenSnippet(provider, audience)} />
			</div>
		</section>
	);
}
