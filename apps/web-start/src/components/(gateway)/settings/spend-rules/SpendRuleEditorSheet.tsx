"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Plus, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
	ProviderInspectorSheet,
	ProviderInspectorSheetContent,
	ProviderInspectorSheetDescription,
	ProviderInspectorSheetHeader,
	ProviderInspectorSheetTitle,
} from "@/components/(data)/model/pricing/ProviderInspectorSheet";
import {
	AlertDialog,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import type { NotificationDestination, SettingsSpendAlertsData } from "@/lib/fetchers/internal/settingsTypes";
import { createSpendRule, testSpendRule, updateSpendRule, type SpendRuleActionError } from "@/app/(dashboard)/settings/notifications/spend-rules-actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { OptionTiles, useBalanceSummary, useForecastSummary, useSpendPercent, useSpendUsd, useSpikeSummary } from "./spendAlertsUi";
import { SpendRuleDestinationPicker } from "./SpendRuleDestinationPicker";
import {
	PRESET_THRESHOLDS,
	addThreshold,
	baseKindsFor,
	baseRefForPeriod,
	canBlock,
	checkDraft,
	draftBaseUsd,
	draftEvaluated,
	draftFromRule,
	draftIssues,
	emptyDraft,
	needsWorkspaceBlockConfirm,
	parseUsd,
	periodsFor,
	previewSummary,
	removeThreshold,
	thresholdAmountsUsd,
	timeZoneOptions,
	usesCooldown,
	usesPercentBase,
	withBaseKind,
	withForecastMode,
	withMetric,
	withPeriod,
	withScope,
	workspaceBlockConfirmMatches,
	type DraftField,
	type SpendRuleDraft,
	type SpendRulePrefill,
} from "./spendRuleDraft";
import { MAX_SPEND_RULE_THRESHOLDS, SPEND_RULE_METRICS, SPEND_RULE_SCOPES, type SpendRule } from "./spendRules";

export type SpendRuleEditorTarget = { mode: "create"; prefill: SpendRulePrefill; key: number } | { mode: "edit"; rule: SpendRule };

const WORKSPACE_ZONE = "__workspace__";

/** Maps a failed server action to translated text. */
export function useSpendActionError() {
	const t = useTranslations("SettingsUI.spendAlerts");
	return (result: SpendRuleActionError, maxRules: number) => {
		if (result.code === "no_notification_destinations" || result.code === "no_active_destinations") return t("errors.noDestinations");
		if (result.code === "spend_rule_limit_reached") return t("errors.limit", { max: maxRules });
		if (result.code === "rate_limited" || result.status === 429) return t("errors.rateLimited");
		if (result.status === 401 || result.status === 403) return t("errors.forbidden");
		if (result.status === 404) return t("errors.notFound");
		if (result.status === 400) return result.message ?? t("errors.invalid");
		return t("errors.failed");
	};
}

export function SpendRuleEditorSheet({ target, onClose, data, destinations }: {
	target: SpendRuleEditorTarget | null;
	onClose: () => void;
	data: SettingsSpendAlertsData;
	destinations: NotificationDestination[];
}) {
	const identity = target ? (target.mode === "edit" ? `edit:${target.rule.id}:${target.rule.updated_at}` : `create:${target.key}`) : "closed";
	return (
		<ProviderInspectorSheet open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<ProviderInspectorSheetContent className="!w-full max-w-none gap-0 overflow-hidden p-0 sm:max-w-none md:!w-[50vw] lg:!w-[48vw] xl:!w-[44vw] 2xl:!w-[42vw] data-[side=right]:sm:max-w-none">
				{target ? <SpendRuleEditorForm key={identity} target={target} onClose={onClose} data={data} destinations={destinations} /> : null}
			</ProviderInspectorSheetContent>
		</ProviderInspectorSheet>
	);
}

function Field({ label, htmlFor, help, error, children }: { label: string; htmlFor?: string; help?: ReactNode; error?: string | null; children: ReactNode }) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
			{error ? <p role="alert" className="text-xs text-destructive">{error}</p> : help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
		</div>
	);
}

function MoneyInput({ id, value, onChange, placeholder, invalid }: { id: string; value: string; onChange: (value: string) => void; placeholder?: string; invalid?: boolean }) {
	return (
		<div className="relative">
			<span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">$</span>
			<Input id={id} className="rounded-md pl-7 tabular-nums" inputMode="decimal" value={value} placeholder={placeholder} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)} />
		</div>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-4 border-t py-5 first:border-t-0 first:pt-0">
			<h3 className="text-sm font-medium">{title}</h3>
			{children}
		</section>
	);
}

function SpendRuleEditorForm({ target, onClose, data, destinations }: {
	target: SpendRuleEditorTarget;
	onClose: () => void;
	data: SettingsSpendAlertsData;
	destinations: NotificationDestination[];
}) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const write = useSettingsWrite();
	const usd = useSpendUsd();
	const percentText = useSpendPercent();
	const balanceSummary = useBalanceSummary();
	const forecastSummary = useForecastSummary();
	const spikeSummary = useSpikeSummary();
	const actionError = useSpendActionError();
	const canManage = data.canManageSpendRules;
	const rule = target.mode === "edit" ? target.rule : null;
	const [draft, setDraft] = useState<SpendRuleDraft>(() => (rule ? draftFromRule(rule) : emptyDraft(target.mode === "create" ? target.prefill : {})));
	const [thresholdInput, setThresholdInput] = useState("");
	const [showIssues, setShowIssues] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [testing, setTesting] = useState(false);
	const [confirmingBlock, setConfirmingBlock] = useState(false);
	const [confirmText, setConfirmText] = useState("");
	const zones = useMemo(() => timeZoneOptions(), []);

	const issues = showIssues ? draftIssues(draft) : [];
	const issueText = (field: DraftField) => {
		const issue = issues.find((entry) => entry.field === field);
		return issue ? t(`issues.${issue.code}`) : null;
	};
	const update = (patch: Partial<SpendRuleDraft>) => setDraft((current) => ({ ...current, ...patch }));
	const percentBase = usesPercentBase(draft);
	const baseUsd = draftBaseUsd(draft, data.options);
	const evaluated = draftEvaluated(draft);
	const ref = baseRefForPeriod(draft.period);
	const preview = rule ? data.previews[rule.id] ?? null : null;
	const summary = previewSummary(preview, rule);

	const scopeOptions = draft.scopeType === "key"
		? data.options.keys.map((key) => ({ value: key.id, label: key.name || key.prefix, description: key.prefix ? `${key.prefix}…` : undefined }))
		: draft.scopeType === "member"
			? data.options.members.map((member) => ({ value: member.id, label: member.name ?? t("scopeLabel.unknown"), description: member.role }))
			: draft.scopeType === "department"
				? data.options.departments.map((department) => ({ value: department.id, label: department.name }))
				: data.options.providers.map((provider) => ({ value: provider.id, label: provider.name, description: provider.id }));

	function addChip(value: string | number) {
		const next = addThreshold(draft.thresholdPercents, value);
		if (!next) {
			toast.error(t("issues.thresholdChip", { max: MAX_SPEND_RULE_THRESHOLDS }));
			return;
		}
		update({ thresholdPercents: next });
		setThresholdInput("");
	}

	function setAction(action: SpendRuleDraft["action"]) {
		setDraft((current) => {
			const next = { ...current, action };
			const threshold = parseUsd(current.thresholdAmountUsd);
			if (action === "block" && current.metric === "spend" && !current.blockAtAmountUsd.trim() && threshold !== null) {
				next.blockAtAmountUsd = String(Math.round(threshold * 110) / 100);
			}
			return next;
		});
	}

	async function save(confirmed = false) {
		setShowIssues(true);
		setFormError(null);
		const check = checkDraft(draft);
		if (check.ok === false) {
			if (check.message) setFormError(check.message);
			return;
		}
		// A workspace-wide block rule can stop every request: confirm by typing its name.
		if (!confirmed && needsWorkspaceBlockConfirm(draft, rule)) {
			setConfirmText("");
			setConfirmingBlock(true);
			return;
		}
		setConfirmingBlock(false);
		setSaving(true);
		const result = await write(rule ? updateSpendRule(rule.id, check.payload) : createSpendRule(check.payload));
		setSaving(false);
		if (result.ok === false) {
			setFormError(actionError(result, data.maxRules));
			return;
		}
		toast.success(rule ? t("toast.saved") : t("toast.created"));
		onClose();
	}

	async function sendTest() {
		if (!rule) return;
		setTesting(true);
		const result = await testSpendRule(rule.id);
		setTesting(false);
		if (result.ok === false) {
			toast.error(actionError(result, data.maxRules));
			return;
		}
		if (result.result.failed > 0) toast.warning(t("toast.testPartial", { delivered: result.result.delivered, failed: result.result.failed }));
		else toast.success(t("toast.testSent", { count: result.result.delivered }));
	}

	const thresholdLine = percentBase
		? thresholdAmountsUsd(draft.thresholdPercents, baseUsd).map((entry) => usd(entry.usd)).join(", ")
		: "";

	return (
		<>
			<ProviderInspectorSheetHeader className="border-b border-zinc-200/80 px-5 py-4 pr-14 dark:border-zinc-800">
				<ProviderInspectorSheetTitle className="truncate text-base">{rule ? (canManage ? t("editor.editTitle") : t("editor.viewTitle")) : t("editor.createTitle")}</ProviderInspectorSheetTitle>
				<ProviderInspectorSheetDescription className="mt-1">{t("editor.description")}</ProviderInspectorSheetDescription>
			</ProviderInspectorSheetHeader>
			<ScrollArea className="min-h-0 flex-1 overscroll-contain" viewportClassName="pb-6 overscroll-contain">
				<form id="spend-rule-editor" className="px-5 py-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
					<fieldset disabled={!canManage || saving} className="min-w-0">
						<Section title={t("editor.sectionAlert")}>
							<Field label={t("editor.name")} htmlFor="spend-rule-name" error={issueText("name")}>
								<Input id="spend-rule-name" className="rounded-md" value={draft.name} maxLength={100} placeholder={t("editor.namePlaceholder")} onChange={(event) => update({ name: event.target.value })} autoFocus={!rule} />
							</Field>
							<Field label={t("editor.type")} htmlFor="spend-rule-metric" help={t(`metricHelp.${draft.metric}`)}>
								<Select disabled={!canManage} value={draft.metric} onValueChange={(value) => setDraft((current) => withMetric(current, value as SpendRuleDraft["metric"]))}>
									<SelectTrigger id="spend-rule-metric" className="w-full rounded-md"><SelectValue>{t(`metric.${draft.metric}`)}</SelectValue></SelectTrigger>
									<SelectContent>{SPEND_RULE_METRICS.map((metric) => <SelectItem key={metric} value={metric}>{t(`metric.${metric}`)}</SelectItem>)}</SelectContent>
								</Select>
							</Field>
							{!evaluated ? (
								<p className="flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
									<Badge variant="outline" className="rounded-md">{t("badges.notEvaluated")}</Badge>
									{t("editor.notEvaluatedNote")}
								</p>
							) : null}
						</Section>

						<Section title={t("editor.sectionScope")}>
							<Field label={t("editor.scopeType")} htmlFor="spend-rule-scope">
								<Select disabled={!canManage} value={draft.scopeType} onValueChange={(value) => setDraft((current) => withScope(current, value as SpendRuleDraft["scopeType"]))}>
									<SelectTrigger id="spend-rule-scope" className="w-full rounded-md"><SelectValue>{t(`scope.${draft.scopeType}`)}</SelectValue></SelectTrigger>
									<SelectContent>{SPEND_RULE_SCOPES.map((scope) => <SelectItem key={scope} value={scope} disabled={draft.metric === "balance" && scope !== "workspace"}>{t(`scope.${scope}`)}</SelectItem>)}</SelectContent>
								</Select>
							</Field>
							{draft.metric === "balance" ? (
								<>
									<p className="text-xs text-muted-foreground">{t("editor.balanceWorkspaceOnly")}</p>
									<p className="text-xs text-muted-foreground">{t("editor.balanceEmailNote")}</p>
								</>
							) : null}
							{draft.scopeType === "model" ? (
								<Field label={t("editor.scopeModel")} htmlFor="spend-rule-scope-id" help={t("editor.scopeModelHelp")} error={issueText("scopeId")}>
									<Input id="spend-rule-scope-id" className="rounded-md font-mono text-sm" value={draft.scopeId} placeholder="openai/gpt-5" onChange={(event) => update({ scopeId: event.target.value })} />
								</Field>
							) : draft.scopeType !== "workspace" ? (
								<Field label={t(`editor.scopePick.${draft.scopeType}`)} htmlFor="spend-rule-scope-id" help={draft.scopeType === "department" ? t("editor.departmentHelp") : draft.scopeType === "member" ? t("editor.memberHelp") : undefined} error={issueText("scopeId")}>
									<SearchableSelect
										id="spend-rule-scope-id"
										label={t(`editor.scopePick.${draft.scopeType}`)}
										value={draft.scopeId}
										options={scopeOptions}
										allowCustom={draft.scopeType === "provider"}
										placeholder={t("editor.scopeSearch")}
										disabled={!canManage}
										onValueChange={(value) => setDraft((current) => withScope(current, current.scopeType, value))}
										triggerClassName="w-full rounded-md"
									/>
								</Field>
							) : null}
						</Section>

						<Section title={t("editor.sectionThreshold")}>
							{draft.metric === "forecast" ? (
								<OptionTiles
									label={t("editor.forecastMode")}
									value={draft.forecastMode}
									onChange={(mode) => setDraft((current) => withForecastMode(current, mode))}
									disabled={!canManage}
									options={[{ value: "amount", title: t("editor.forecastByAmount") }, { value: "percent", title: t("editor.forecastByPercent") }]}
								/>
							) : null}
							{draft.metric === "spend" || (draft.metric === "forecast" && draft.forecastMode === "amount") ? (
								<Field label={draft.metric === "spend" ? t("editor.spendAmount") : t("editor.forecastAmount")} htmlFor="spend-rule-amount" error={issueText("thresholdAmountUsd")}>
									<MoneyInput id="spend-rule-amount" value={draft.thresholdAmountUsd} placeholder="100" invalid={Boolean(issueText("thresholdAmountUsd"))} onChange={(value) => update({ thresholdAmountUsd: value })} />
								</Field>
							) : null}
							{percentBase ? (
								<>
									<Field label={t("editor.base")} htmlFor="spend-rule-base" error={issueText("baseKind") ?? issueText("period")}>
										<Select disabled={!canManage} value={draft.baseKind} onValueChange={(value) => setDraft((current) => withBaseKind(current, value as SpendRuleDraft["baseKind"]))}>
											<SelectTrigger id="spend-rule-base" className="w-full rounded-md"><SelectValue>{t(`base.${draft.baseKind}`)}</SelectValue></SelectTrigger>
											<SelectContent>{baseKindsFor(draft).map((kind) => <SelectItem key={kind} value={kind}>{t(`base.${kind}`)}</SelectItem>)}</SelectContent>
										</Select>
									</Field>
									{draft.baseKind === "amount" ? (
										<Field label={t("editor.baseAmount")} htmlFor="spend-rule-base-amount" help={t("editor.baseAmountHelp")} error={issueText("baseAmountUsd")}>
											<MoneyInput id="spend-rule-base-amount" value={draft.baseAmountUsd} placeholder="100" invalid={Boolean(issueText("baseAmountUsd"))} onChange={(value) => update({ baseAmountUsd: value })} />
										</Field>
									) : draft.baseKind === "workspace_budget" ? (
										<div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
											<p className="text-sm text-foreground">
												{ref && baseUsd !== null ? t("editor.budgetBase", { interval: ref, amount: usd(baseUsd) }) : t("editor.budgetMissing", { interval: (ref ?? "monthly") })}
											</p>
											<p>{t("editor.budgetBaseHelp")}</p>
											<p><Link href="/settings/budgets" className="underline underline-offset-3 hover:text-foreground">{t("editor.manageBudgets")}</Link></p>
										</div>
									) : draft.baseKind === "key_limit" ? (
										<div className="space-y-1 rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
											<p className="text-sm text-foreground">
												{!draft.scopeId ? t("editor.keyLimitPickKey") : ref && baseUsd !== null ? t("editor.keyLimitBase", { interval: ref, amount: usd(baseUsd) }) : t("editor.keyLimitMissing", { interval: (ref ?? "monthly") })}
											</p>
											<p>{t("editor.keyLimitHelp")}</p>
										</div>
									) : (
										<p className="rounded-md border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">{t("editor.previousPeriodHelp")}</p>
									)}
									<div className="space-y-2">
										<div className="flex flex-wrap items-center justify-between gap-2">
											<Label htmlFor="spend-rule-threshold">{t("editor.thresholds")}</Label>
											<Button type="button" variant="ghost" size="sm" className="h-7 rounded-md px-2 text-xs" onClick={() => update({ thresholdPercents: [...PRESET_THRESHOLDS] })}>{t("editor.thresholdPreset")}</Button>
										</div>
										<div className="flex flex-wrap items-center gap-1.5">
											{draft.thresholdPercents.map((percent) => (
												<span key={percent} className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs tabular-nums">
													{percent}%
													{canManage ? (
														<button type="button" className="rounded-md text-muted-foreground hover:text-foreground" aria-label={t("editor.removeThreshold", { percent })} onClick={() => update({ thresholdPercents: removeThreshold(draft.thresholdPercents, percent) })}>
															<X className="size-3" />
														</button>
													) : null}
												</span>
											))}
											{draft.thresholdPercents.length < MAX_SPEND_RULE_THRESHOLDS ? (
												<span className="inline-flex items-center gap-1">
													<Input
														id="spend-rule-threshold"
														className="h-7 w-20 rounded-md text-xs tabular-nums"
														inputMode="numeric"
														placeholder="90%"
														value={thresholdInput}
														onChange={(event) => setThresholdInput(event.target.value)}
														onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); if (thresholdInput.trim()) addChip(thresholdInput); } }}
													/>
													<Button type="button" variant="outline" size="icon-sm" className="size-7 rounded-md" aria-label={t("editor.addThreshold")} disabled={!thresholdInput.trim()} onClick={() => addChip(thresholdInput)}><Plus className="size-3.5" /></Button>
												</span>
											) : null}
										</div>
										{issueText("thresholdPercents") ? <p role="alert" className="text-xs text-destructive">{issueText("thresholdPercents")}</p> : (
											<p className="text-xs text-muted-foreground">{thresholdLine ? t("editor.thresholdAmounts", { amounts: thresholdLine }) : t("editor.thresholdHelp", { max: MAX_SPEND_RULE_THRESHOLDS })}</p>
										)}
									</div>
								</>
							) : null}
							{draft.metric === "spike" ? (
								<div className="grid gap-4 sm:grid-cols-2">
									<Field label={t("editor.spikeMultiplier")} htmlFor="spend-rule-multiplier" help={t("editor.spikeMultiplierHelp")} error={issueText("spikeMultiplier")}>
										<Input id="spend-rule-multiplier" className="rounded-md tabular-nums" inputMode="decimal" value={draft.spikeMultiplier} onChange={(event) => update({ spikeMultiplier: event.target.value })} />
									</Field>
									<Field label={t("editor.spikeFloor")} htmlFor="spend-rule-floor" help={t("editor.spikeFloorHelp")} error={issueText("spikeFloorUsd")}>
										<MoneyInput id="spend-rule-floor" value={draft.spikeFloorUsd} onChange={(value) => update({ spikeFloorUsd: value })} />
									</Field>
								</div>
							) : null}
							{draft.metric === "balance" ? (
								<div className="grid gap-4 sm:grid-cols-2">
									<Field label={t("editor.balanceAmount")} htmlFor="spend-rule-balance" help={t("editor.optional")} error={issueText("thresholdAmountUsd")}>
										<MoneyInput id="spend-rule-balance" value={draft.thresholdAmountUsd} placeholder="20" onChange={(value) => update({ thresholdAmountUsd: value })} />
									</Field>
									<Field label={t("editor.runwayDays")} htmlFor="spend-rule-runway" help={t("editor.optional")} error={issueText("runwayDays")}>
										<Input id="spend-rule-runway" className="rounded-md tabular-nums" inputMode="numeric" placeholder="7" value={draft.runwayDays} onChange={(event) => update({ runwayDays: event.target.value })} />
									</Field>
								</div>
							) : null}
						</Section>

						<Section title={t("editor.sectionPeriod")}>
							<div className="grid gap-4 sm:grid-cols-2">
								{draft.metric !== "spike" && draft.metric !== "balance" ? (
									<Field label={t("editor.period")} htmlFor="spend-rule-period" help={percentBase && draft.baseKind !== "amount" && draft.baseKind !== "previous_period" ? t("editor.periodMatchesBase") : undefined}>
										<Select disabled={!canManage} value={draft.period} onValueChange={(value) => setDraft((current) => withPeriod(current, value as SpendRuleDraft["period"]))}>
											<SelectTrigger id="spend-rule-period" className="w-full rounded-md"><SelectValue>{t(`period.${draft.period}`)}</SelectValue></SelectTrigger>
											<SelectContent>{periodsFor(draft).map((period) => <SelectItem key={period} value={period}>{t(`period.${period}`)}</SelectItem>)}</SelectContent>
										</Select>
									</Field>
								) : null}
								{draft.period === "rolling" ? (
									<Field
										label={draft.metric === "spike" ? t("editor.spikeWindow") : draft.metric === "balance" ? t("editor.balanceLookback") : t("editor.windowHours")}
										htmlFor="spend-rule-window"
										help={draft.metric === "spike" ? t("editor.spikeWindowHelp") : t("editor.windowHoursHelp")}
										error={issueText("windowHours")}
									>
										<Input id="spend-rule-window" className="rounded-md tabular-nums" inputMode="numeric" value={draft.windowHours} onChange={(event) => update({ windowHours: event.target.value })} />
									</Field>
								) : (
									<Field label={t("editor.timeZone")} htmlFor="spend-rule-zone" help={t("editor.timeZoneHelp")} error={issueText("timeZone")}>
										<SearchableSelect
											id="spend-rule-zone"
											label={t("editor.timeZone")}
											value={draft.timeZone || WORKSPACE_ZONE}
											options={[{ value: WORKSPACE_ZONE, label: t("editor.timeZoneDefault", { zone: data.billingTimeZone }) }, ...zones.map((zone) => ({ value: zone, label: zone }))]}
											disabled={!canManage}
											onValueChange={(value) => update({ timeZone: value === WORKSPACE_ZONE ? "" : value })}
											triggerClassName="w-full rounded-md"
										/>
									</Field>
								)}
								{usesCooldown(draft) ? (
									<Field label={t("editor.cooldown")} htmlFor="spend-rule-cooldown" help={t("editor.cooldownHelp")} error={issueText("cooldownMinutes")}>
										<Input id="spend-rule-cooldown" className="rounded-md tabular-nums" inputMode="numeric" value={draft.cooldownMinutes} onChange={(event) => update({ cooldownMinutes: event.target.value })} />
									</Field>
								) : null}
							</div>
						</Section>

						{/* Block is offered once the gateway enforces blocks, and kept for a rule that already blocks. */}
						{(data.blocksEnabled || draft.action === "block") && canBlock(draft) ? (
							<Section title={t("editor.sectionAction")}>
								<OptionTiles
									label={t("editor.sectionAction")}
									value={draft.action}
									onChange={setAction}
									disabled={!canManage}
									options={[
										{ value: "notify", title: t("action.notify"), description: t("action.notifyHelp") },
										{ value: "block", title: t("action.block"), description: t("action.blockHelp") },
									]}
								/>
								{draft.action === "block" ? (
									<>
										{draft.metric === "budget_percent" ? (
											<Field label={t("editor.blockAtPercent")} htmlFor="spend-rule-block-percent" help={t("editor.blockAtPercentHelp")} error={issueText("blockAtPercent")}>
												<div className="relative w-full sm:w-40">
													<Input id="spend-rule-block-percent" className="rounded-md pr-7 tabular-nums" inputMode="numeric" value={draft.blockAtPercent} onChange={(event) => update({ blockAtPercent: event.target.value })} />
													<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
												</div>
											</Field>
										) : (
											<Field label={t("editor.blockAtAmount")} htmlFor="spend-rule-block-amount" help={t("editor.blockAtAmountHelp")} error={issueText("blockAtAmountUsd")}>
												<MoneyInput id="spend-rule-block-amount" value={draft.blockAtAmountUsd} onChange={(value) => update({ blockAtAmountUsd: value })} />
											</Field>
										)}
										<div className="flex items-start justify-between gap-3 rounded-md border px-3 py-2.5">
											<div>
												<Label htmlFor="spend-rule-free-models" className="text-sm">{t("editor.blockFreeModels")}</Label>
												<p className="mt-0.5 text-xs text-muted-foreground">{t("editor.blockFreeModelsHelp")}</p>
											</div>
											<Switch id="spend-rule-free-models" checked={draft.blockFreeModels} onCheckedChange={(checked) => update({ blockFreeModels: Boolean(checked) })} />
										</div>
										<Callout tone="warning" className="text-xs">
											<p>{t.rich("editor.bestEffort", {
												keys: (chunks) => <Link href="/settings/keys" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link>,
												budgets: (chunks) => <Link href="/settings/budgets" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link>,
											})}</p>
											{data.blocksEnabled ? null : <p className="mt-1 font-medium">{t("editor.blockingOff")}</p>}
										</Callout>
									</>
								) : null}
							</Section>
						) : null}

						<Section title={t("editor.sectionDestinations")}>
							<Field label={t("editor.destinations")} htmlFor="spend-rule-destinations" help={destinations.length === 0 ? t("editor.noDestinations") : t("editor.destinationsHelp")}>
								<SpendRuleDestinationPicker id="spend-rule-destinations" destinations={destinations} value={draft.destinationIds} onChange={(destinationIds) => update({ destinationIds })} disabled={!canManage} />
							</Field>
						</Section>
					</fieldset>

					<section className="space-y-2 border-t pt-5" aria-live="polite">
						<h3 className="text-sm font-medium">{t("editor.preview")}</h3>
						<p className="text-sm tabular-nums">
							{summary?.kind === "ofBase"
								? t("preview.ofBase", { value: usd(summary.valueUsd), base: usd(summary.baseUsd), percent: percentText(summary.percent) })
								: summary?.kind === "value"
									? t("preview.value", { value: usd(summary.valueUsd) })
									: summary?.kind === "balance"
										? balanceSummary.text(summary)
									: summary?.kind === "forecast" || summary?.kind === "forecastPending"
										? forecastSummary.text(summary)
									: summary?.kind === "spike" || summary?.kind === "spikePending"
										? spikeSummary.text(summary)
									: rule && !rule.evaluated
										? t("preview.notEvaluated")
										: rule && !rule.enabled
											? t("preview.disabled")
											: rule
												? t("preview.unavailable")
												: t("preview.afterSave")}
						</p>
						{rule ? <p className="text-xs text-muted-foreground">{t("preview.savedRuleNote")}</p> : null}
					</section>
					{formError ? <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{formError}</p> : null}
				</form>
			</ScrollArea>
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-zinc-200/80 bg-background px-5 py-3 dark:border-zinc-800">
				<div>
					{rule && canManage ? (
						<Button type="button" variant="outline" className="rounded-md" disabled={testing || saving} onClick={() => void sendTest()} title={t("editor.testHelp")}>
							<Send className="size-4" />{testing ? t("editor.testing") : t("editor.sendTest")}
						</Button>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					<Button type="button" variant="outline" className="rounded-md" onClick={onClose} disabled={saving}>{canManage ? t("editor.cancel") : t("editor.close")}</Button>
					{canManage ? <Button type="submit" form="spend-rule-editor" className="rounded-md" disabled={saving}>{saving ? t("editor.saving") : rule ? t("editor.save") : t("editor.create")}</Button> : null}
				</div>
			</div>
			<AlertDialog open={confirmingBlock} onOpenChange={(open) => { if (!open) setConfirmingBlock(false); }}>
				<AlertDialogContent className="rounded-md">
					<form onSubmit={(event) => { event.preventDefault(); if (workspaceBlockConfirmMatches(confirmText, draft.name)) void save(true); }}>
						<AlertDialogHeader>
							<AlertDialogTitle>{t("confirmBlock.title")}</AlertDialogTitle>
							<AlertDialogDescription>{t("confirmBlock.body", { name: draft.name.trim() })}</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="my-4 space-y-1.5">
							<Label htmlFor="spend-rule-confirm-block">{t("confirmBlock.label", { name: draft.name.trim() })}</Label>
							<Input id="spend-rule-confirm-block" className="rounded-md" value={confirmText} autoComplete="off" autoFocus onChange={(event) => setConfirmText(event.target.value)} />
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel type="button" className="rounded-md">{t("delete.cancel")}</AlertDialogCancel>
							<Button type="submit" variant="destructive" className="rounded-md" disabled={!workspaceBlockConfirmMatches(confirmText, draft.name)}>{t("confirmBlock.confirm")}</Button>
						</AlertDialogFooter>
					</form>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
