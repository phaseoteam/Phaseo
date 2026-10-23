"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Gauge, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
	assignRateLimitPolicy,
	changeRateLimitAssignment,
	createRateLimitPolicy,
	deleteRateLimitPolicy,
	removeRateLimitAssignment,
	updateRateLimitPolicy,
	type RateLimitActionError,
} from "@/app/(dashboard)/settings/rate-limits/actions";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
	SettingsRateLimitPolicy,
	SettingsRateLimitsInitialData,
	SettingsRateLimitTargetType,
} from "@/lib/fetchers/internal/settingsTypes";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import {
	MAX_DESCRIPTION_LENGTH,
	MAX_NAME_LENGTH,
	TARGET_TYPES,
	draftFromPolicy,
	draftToPayload,
	emptyPolicyDraft,
	targetName,
	targetOptions,
	type PolicyDraft,
	type PolicyProblem,
} from "./rateLimitForm";
import WorkspaceTierSection from "./WorkspaceTierSection";

type Data = SettingsRateLimitsInitialData;
type EditorState = { mode: "create" } | { mode: "edit"; policy: SettingsRateLimitPolicy } | null;

function Notice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function useActionError() {
	const t = useTranslations("SettingsUI.rateLimitPolicies");
	return (result: RateLimitActionError, fallback: string) => result.message ? t("errors.invalid", { message: result.message }) : fallback;
}

export default function RateLimitsSettingsClient({ data }: { data: Data }) {
	const t = useTranslations("SettingsUI.rateLimitPolicies");
	const [editor, setEditor] = useState<EditorState>(null);
	if (!data.workspaceId) return <Notice>{t("selectWorkspace")}</Notice>;
	if (!data.canManageRateLimits) return <Notice>{t("adminsOnly")}</Notice>;
	return (
		<div className="space-y-8">
			<p className="rounded-md border-l-2 border-primary/60 bg-muted/30 px-4 py-3 text-sm">{t("howItWorks")}</p>
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
						{data.policies.map((policy) => <PolicyRow key={policy.id} policy={policy} data={data} onEdit={() => setEditor({ mode: "edit", policy })} />)}
					</ul>
				) : (
					<Empty className="rounded-md border border-dashed p-8">
						<EmptyHeader>
							<EmptyMedia variant="icon"><Gauge className="h-5 w-5" /></EmptyMedia>
							<EmptyTitle>{t("emptyTitle")}</EmptyTitle>
							<EmptyDescription>{t("emptyBody")}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</section>
			<AssignmentsSection data={data} />
			<WorkspaceTierSection tier={data.tier ?? null} />
			{editor ? <PolicyDialog key={editor.mode === "edit" ? editor.policy.id : "new"} state={editor} onClose={() => setEditor(null)} /> : null}
		</div>
	);
}

function PolicyRow({ policy, data, onEdit }: { policy: SettingsRateLimitPolicy; data: Data; onEdit: () => void }) {
	const t = useTranslations("SettingsUI.rateLimitPolicies");
	const actionError = useActionError();
	const write = useSettingsWrite();
	const [confirming, setConfirming] = useState(false);
	const [deleting, startDeleting] = useTransition();
	const throttled = data.throttles.find((entry) => entry.policyId === policy.id)?.throttledRequests ?? 0;
	const assigned = data.assignments.filter((assignment) => assignment.policyId === policy.id);
	const limits = [
		policy.requestsPerMinute != null ? t("limitRequests", { count: policy.requestsPerMinute }) : null,
		policy.tokensPerMinute != null ? t("limitTokens", { count: policy.tokensPerMinute }) : null,
		policy.concurrentRequests != null ? t("limitConcurrent", { count: policy.concurrentRequests }) : null,
	].filter(Boolean);

	function remove() {
		startDeleting(async () => {
			const result = await write(deleteRateLimitPolicy(policy.id));
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
						{policy.failClosed ? <Badge variant="outline">{t("strict")}</Badge> : null}
					</div>
					{policy.description ? <p className="mt-1 text-sm text-muted-foreground">{policy.description}</p> : null}
				</div>
				<div className="flex gap-2">
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={onEdit}>{t("edit")}</Button>
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => setConfirming(true)}>{t("delete")}</Button>
				</div>
			</div>
			<dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
				<div className="flex gap-2"><dt className="text-muted-foreground">{t("listLimits")}</dt><dd>{limits.join(" · ")}</dd></div>
				<div className="flex gap-2"><dt className="text-muted-foreground">{t("listThrottled")}</dt><dd>
					{throttled ? t("throttled", { count: throttled, hours: data.throttleWindowHours }) : t("notThrottled", { hours: data.throttleWindowHours })}
				</dd></div>
				<div className="flex gap-2 sm:col-span-2"><dt className="text-muted-foreground">{t("listAppliesTo")}</dt><dd>
					{assigned.length ? assigned.map((assignment) => targetLabel(t, assignment.targetType, assignment.targetId, data)).join(", ") : t("notAssigned")}
				</dd></div>
			</dl>
			<AlertDialog open={confirming} onOpenChange={(open) => { if (!deleting) setConfirming(open); }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("deleteTitle", { name: policy.name })}</AlertDialogTitle>
						<AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
						<AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); remove(); }}>{t("delete")}</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</li>
	);
}

type Translate = ReturnType<typeof useTranslations<"SettingsUI.rateLimitPolicies">>;

function targetLabel(t: Translate, type: SettingsRateLimitTargetType, id: string | null, data: Data): string {
	if (type === "end_user_default") return t("targetTypes.end_user_default");
	const name = targetName(type, id, data.targets, t("unnamedMember")) ?? t("removedTarget");
	return `${t(`targetTypes.${type}`)}: ${name}`;
}

function PolicyDialog({ state, onClose }: { state: Exclude<EditorState, null>; onClose: () => void }) {
	const t = useTranslations("SettingsUI.rateLimitPolicies");
	const actionError = useActionError();
	const write = useSettingsWrite();
	const existing = state.mode === "edit" ? state.policy : null;
	const [draft, setDraft] = useState<PolicyDraft>(() => existing ? draftFromPolicy(existing) : emptyPolicyDraft());
	const [problem, setProblem] = useState<PolicyProblem | null>(null);
	const [saving, startSaving] = useTransition();
	const set = (field: keyof PolicyDraft, value: string) => {
		setDraft((current) => ({ ...current, [field]: value }));
		setProblem(null);
	};

	function save() {
		const built = draftToPayload(draft, existing);
		if (!built.ok) {
			setProblem(built.problem);
			return;
		}
		startSaving(async () => {
			const result = existing
				? await write(updateRateLimitPolicy(existing.id, built.payload))
				: await write(createRateLimitPolicy(built.payload));
			if (!result.ok) {
				toast.error(actionError(result, t("errors.saveFailed")));
				return;
			}
			toast.success(existing ? t("toasts.saved") : t("toasts.created"));
			onClose();
		});
	}

	const field = (name: PolicyProblem) => problem === name ? <p className="text-xs text-destructive">{t(`problems.${name}`)}</p> : null;
	return (
		<Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{existing ? t("dialogEditTitle", { name: existing.name }) : t("dialogCreateTitle")}</DialogTitle>
					<DialogDescription>{t("propagation")}</DialogDescription>
				</DialogHeader>
				<form className="space-y-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
					<div className="space-y-1.5">
						<Label htmlFor="rate-limit-name">{t("fields.name")}</Label>
						<Input id="rate-limit-name" value={draft.name} maxLength={MAX_NAME_LENGTH} onChange={(event) => set("name", event.target.value)} aria-invalid={problem === "name"} />
						{field("name")}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="rate-limit-description">{t("fields.description")}</Label>
						<Textarea id="rate-limit-description" value={draft.description} rows={2} maxLength={MAX_DESCRIPTION_LENGTH} placeholder={t("fields.descriptionPlaceholder")} onChange={(event) => set("description", event.target.value)} aria-invalid={problem === "description"} />
						{field("description")}
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-1.5">
							<Label htmlFor="rate-limit-rpm">{t("fields.requestsPerMinute")}</Label>
							<Input id="rate-limit-rpm" inputMode="numeric" value={draft.requestsPerMinute} placeholder={t("fields.noLimit")} onChange={(event) => set("requestsPerMinute", event.target.value)} aria-invalid={problem === "requestsPerMinute"} />
							{field("requestsPerMinute")}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="rate-limit-tpm">{t("fields.tokensPerMinute")}</Label>
							<Input id="rate-limit-tpm" inputMode="numeric" value={draft.tokensPerMinute} placeholder={t("fields.noLimit")} onChange={(event) => set("tokensPerMinute", event.target.value)} aria-invalid={problem === "tokensPerMinute"} />
							{field("tokensPerMinute")}
						</div>
					</div>
					{field("limits")}
					<p className="text-xs text-muted-foreground">{t("fields.tokensHint")}</p>
					{existing && (existing.concurrentRequests != null || existing.failClosed) ? <p className="text-xs text-muted-foreground">{t("fields.apiOnlyHint")}</p> : null}
					<DialogFooter>
						<Button type="button" variant="outline" className="rounded-md" disabled={saving} onClick={onClose}>{t("cancel")}</Button>
						<Button type="submit" className="rounded-md" disabled={saving}>{existing ? t("save") : t("create")}</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function AssignmentsSection({ data }: { data: Data }) {
	const t = useTranslations("SettingsUI.rateLimitPolicies");
	const actionError = useActionError();
	const write = useSettingsWrite();
	const [targetType, setTargetType] = useState<SettingsRateLimitTargetType>("key");
	const [targetId, setTargetId] = useState("");
	const [policyId, setPolicyId] = useState("");
	const [pending, startPending] = useTransition();
	const unnamedMember = t("unnamedMember");
	const options = useMemo(
		() => targetType === "end_user_default" ? [] : targetOptions(targetType, data, unnamedMember),
		[targetType, data, unnamedMember],
	);
	const endUserTaken = data.assignments.some((assignment) => assignment.targetType === "end_user_default");
	const needsTarget = targetType !== "end_user_default";
	const noneLeft = needsTarget ? options.length === 0 : endUserTaken;
	const canAssign = Boolean(policyId) && (!needsTarget || options.some((option) => option.value === targetId)) && !noneLeft;
	const policyOptions = data.policies.map((policy) => ({ value: policy.id, label: policy.name }));

	/** Each operation wraps its action in write() so cached settings reads refresh after it settles. */
	function run(operation: () => Promise<{ ok: true } | RateLimitActionError>, success: string, after?: () => void) {
		startPending(async () => {
			const result = await operation();
			if (!result.ok) {
				toast.error(actionError(result, t("errors.assignFailed")));
				return;
			}
			after?.();
			toast.success(success);
		});
	}

	return (
		<section className="space-y-3">
			<div>
				<h2 className="text-base font-semibold">{t("assignmentsTitle")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("assignmentsDescription")}</p>
			</div>
			{data.policies.length ? (
				<div className="grid gap-3 rounded-md border p-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,12rem)_auto] sm:items-end">
					<div className="space-y-1.5">
						<Label>{t("assignType")}</Label>
						<Select value={targetType} onValueChange={(value) => { setTargetType(value as SettingsRateLimitTargetType); setTargetId(""); }}>
							<SelectTrigger className="w-full rounded-md" aria-label={t("assignType")}><SelectValue>{t(`targetTypes.${targetType}`)}</SelectValue></SelectTrigger>
							<SelectContent>
								{TARGET_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`targetTypes.${type}`)}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label>{t("assignTarget")}</Label>
						{needsTarget ? (
							<SearchableSelect label={t("assignTarget")} value={targetId} options={options} onValueChange={setTargetId} disabled={pending || noneLeft} placeholder={noneLeft ? t("noTargets") : t("chooseTarget")} triggerClassName="w-full rounded-md" />
						) : (
							<p className="flex h-9 items-center text-sm text-muted-foreground">{endUserTaken ? t("endUserTaken") : t("endUserHint")}</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label>{t("assignPolicy")}</Label>
						<SearchableSelect label={t("assignPolicy")} value={policyId} options={policyOptions} onValueChange={setPolicyId} disabled={pending} placeholder={t("choosePolicy")} triggerClassName="w-full rounded-md" />
					</div>
					<Button
						type="button"
						className="rounded-md"
						disabled={pending || !canAssign}
						onClick={() => run(
							() => write(assignRateLimitPolicy({ policyId, targetType, targetId: needsTarget ? targetId : null })),
							t("toasts.assigned"),
							() => setTargetId(""),
						)}
					>
						{t("assign")}
					</Button>
				</div>
			) : <Notice>{t("noPolicies")}</Notice>}
			{data.assignments.length ? (
				<ul className="divide-y rounded-md border">
					{data.assignments.map((assignment) => (
						<li key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
							<span className="min-w-0 truncate text-sm">{targetLabel(t, assignment.targetType, assignment.targetId, data)}</span>
							<div className="flex items-center gap-2">
								<Select
									value={assignment.policyId}
									disabled={pending}
									onValueChange={(value) => run(() => write(changeRateLimitAssignment(assignment.id, value)), t("toasts.changed"))}
								>
									<SelectTrigger className="w-48 rounded-md" aria-label={t("assignPolicy")}><SelectValue>{data.policies.find((policy) => policy.id === assignment.policyId)?.name ?? t("choosePolicy")}</SelectValue></SelectTrigger>
									<SelectContent>
										{data.policies.map((policy) => <SelectItem key={policy.id} value={policy.id}>{policy.name}</SelectItem>)}
									</SelectContent>
								</Select>
								<Button type="button" variant="outline" size="sm" className="rounded-md" disabled={pending} onClick={() => run(() => write(removeRateLimitAssignment(assignment.id)), t("toasts.removed"))}>
									{t("remove")}
								</Button>
							</div>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}
