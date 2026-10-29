"use client";

import { useEffect, useState } from "react";
import { parseAsString, useQueryStates } from "nuqs";
import { BellRing, History, MoreHorizontal, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { NotificationDestination, SettingsSpendAlertsData } from "@/lib/fetchers/internal/settingsTypes";
import { deleteSpendRule, testSpendRule, updateSpendRule } from "@/app/(dashboard)/settings/notifications/spend-rules-actions";
import { SettingsResourceQuery, useSettingsWrite } from "../PrivateSettingsQuery";
import { SpendRuleEditorSheet, useSpendActionError, type SpendRuleEditorTarget } from "./SpendRuleEditorSheet";
import { SpendBlocksList } from "./SpendBlocksList";
import { SpendRuleHistorySheet } from "./SpendRuleHistorySheet";
import { SpendWorkspaceSettings, type DepartmentSpendAttribution } from "./SpendWorkspaceSettings";
import { useBalanceSummary, useScopeLabel, useSpendPercent, useSpendUsd } from "./spendAlertsUi";
import { SPEND_ALERT_ANCHOR, prefillFromSearchParams, previewSummary } from "./spendRuleDraft";
import type { SpendBlock, SpendRule } from "./spendRules";

// The shortcut links' query parameters; while spendAlert=new is in the URL, the editor is open, prefilled.
const PREFILL_PARAMS = {
	spendAlert: parseAsString, metric: parseAsString, scope: parseAsString, scopeId: parseAsString,
	period: parseAsString, base: parseAsString, thresholds: parseAsString, name: parseAsString,
};

/**
 * Settings → Notifications → Spend alerts: the workspace's spend rules with their current value,
 * the editor, per-rule history and test sends, plus the workspace's billing time zone and
 * department attribution. Owners and admins edit; other members see everything read-only.
 */
export default function SpendAlertsSection({ destinations, departmentSpendAttribution }: {
	destinations: NotificationDestination[];
	departmentSpendAttribution: DepartmentSpendAttribution;
}) {
	const t = useTranslations("SettingsUI.spendAlerts");
	return (
		<section id={SPEND_ALERT_ANCHOR} aria-labelledby="spend-alerts-title" className="scroll-mt-20 space-y-3">
			<div>
				<h2 id="spend-alerts-title" className="font-heading text-base font-medium">{t("title")}</h2>
				<p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
			</div>
			<SettingsResourceQuery resource="spend-rules">
				{(data) => <SpendAlertsPanel data={data} destinations={destinations} departmentSpendAttribution={departmentSpendAttribution} />}
			</SettingsResourceQuery>
		</section>
	);
}

function SpendAlertsPanel({ data, destinations, departmentSpendAttribution }: {
	data: SettingsSpendAlertsData;
	destinations: NotificationDestination[];
	departmentSpendAttribution: DepartmentSpendAttribution;
}) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const canManage = data.canManageSpendRules;
	const atLimit = data.rules.length >= data.maxRules;
	// A shortcut link (key page, budgets page) opens the editor prefilled for as long as its
	// parameters are in the URL, so reloading, sharing and Back/Forward keep the sheet in step.
	const [linkParams, setLinkParams] = useQueryStates(PREFILL_PARAMS, { shallow: true, scroll: false, history: "replace" });
	const linkPrefill = canManage && !atLimit ? prefillFromSearchParams({ get: (name) => linkParams[name as keyof typeof PREFILL_PARAMS] ?? null }) : null;
	const [openedEditor, setOpenedEditor] = useState<SpendRuleEditorTarget | null>(null);
	const editor = openedEditor ?? (linkPrefill ? { mode: "create" as const, prefill: linkPrefill, key: 0 } : null);
	const linked = linkParams.spendAlert !== null;
	const [createCount, setCreateCount] = useState(1);
	const [historyRule, setHistoryRule] = useState<SpendRule | null>(null);
	const [deleting, setDeleting] = useState<SpendRule | null>(null);

	useEffect(() => {
		if (linked) document.getElementById(SPEND_ALERT_ANCHOR)?.scrollIntoView({ block: "start" });
	}, [linked]);

	/** Opens the editor from the page, dropping a shortcut link's parameters (and only those). */
	function setEditor(target: SpendRuleEditorTarget | null) {
		setOpenedEditor(target);
		if (linked) void setLinkParams(null);
	}

	function openCreate() {
		setEditor({ mode: "create", prefill: {}, key: createCount });
		setCreateCount((count) => count + 1);
	}

	return (
		<div className="space-y-6">
			<SpendBlocksList blocks={data.blocks ?? []} canManage={canManage} options={data.options} maxRules={data.maxRules} />
			<div className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p className="text-xs text-muted-foreground">{t("count", { count: data.rules.length, max: data.maxRules })}</p>
					{canManage ? (
						<Button type="button" className="rounded-md" onClick={openCreate} disabled={atLimit} title={atLimit ? t("errors.limit", { max: data.maxRules }) : undefined}>
							<Plus className="size-4" />{t("add")}
						</Button>
					) : null}
				</div>
				{data.rules.length === 0 ? (
					<div className="flex flex-col items-center rounded-md border px-6 py-10 text-center">
						<div className="mb-4 rounded-md border bg-muted/40 p-3"><BellRing className="size-5 text-muted-foreground" /></div>
						<h3 className="text-sm font-medium">{t("empty.title")}</h3>
						<p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("empty.body")}</p>
						{canManage ? <Button type="button" variant="outline" className="mt-5 rounded-md" onClick={openCreate}><Plus className="size-4" />{t("add")}</Button> : null}
					</div>
				) : (
					<ul className="divide-y rounded-md border bg-background/40">
						{data.rules.map((rule) => (
							<SpendRuleRow
								key={`${rule.id}:${rule.updated_at}`}
								rule={rule}
								data={data}
								activeBlock={(data.blocks ?? []).find((block) => block.active && block.rule_id === rule.id) ?? null}
								onEdit={() => setEditor({ mode: "edit", rule })}
								onHistory={() => setHistoryRule(rule)}
								onDelete={() => setDeleting(rule)}
							/>
						))}
					</ul>
				)}
				{!canManage ? <p className="text-xs text-muted-foreground">{t("readOnly")}</p> : null}
			</div>

			<div className="space-y-3">
				<div>
					<h3 className="text-sm font-medium">{t("workspace.title")}</h3>
					<p className="mt-0.5 text-sm text-muted-foreground">{t("workspace.description")}</p>
				</div>
				<SpendWorkspaceSettings billingTimeZone={data.billingTimeZone} departmentSpendAttribution={departmentSpendAttribution} canManage={canManage} />
			</div>

			<SpendRuleEditorSheet target={editor} onClose={() => setEditor(null)} data={data} destinations={destinations} />
			<SpendRuleHistorySheet rule={historyRule} onClose={() => setHistoryRule(null)} />
			<DeleteSpendRuleDialog rule={deleting} maxRules={data.maxRules} onClose={() => setDeleting(null)} />
		</div>
	);
}

function useRuleSummary() {
	const t = useTranslations("SettingsUI.spendAlerts");
	const usd = useSpendUsd();
	return (rule: SpendRule) => {
		const percents = (rule.threshold_percents ?? []).map((percent) => `${percent}%`).join(", ");
		const base = rule.base_kind === "amount" && rule.base_amount_usd !== null ? usd(rule.base_amount_usd)
			: rule.base_kind === "workspace_budget" && rule.base_ref ? t("summary.budgetBase", { interval: rule.base_ref })
				: rule.base_kind === "key_limit" && rule.base_ref ? t("summary.keyLimitBase", { interval: rule.base_ref })
					: t("summary.previousPeriodBase");
		if (rule.metric === "spend") return t("summary.spend", { amount: usd(rule.threshold_amount_usd ?? 0) });
		if (rule.metric === "budget_percent") return t("summary.percentOf", { thresholds: percents, base });
		if (rule.metric === "forecast") {
			return rule.threshold_amount_usd !== null ? t("summary.forecastAmount", { amount: usd(rule.threshold_amount_usd) }) : t("summary.forecastPercent", { thresholds: percents, base });
		}
		if (rule.metric === "spike") return t("summary.spike", { multiplier: rule.spike_multiplier ?? 0, hours: rule.window_hours ?? 0, floor: usd(rule.spike_floor_usd ?? 0) });
		const parts = [
			rule.threshold_amount_usd !== null ? t("summary.balanceAmount", { amount: usd(rule.threshold_amount_usd) }) : null,
			rule.runway_days !== null ? t("summary.balanceRunway", { days: rule.runway_days }) : null,
		].filter(Boolean);
		return parts.join(" · ");
	};
}

function SpendRuleRow({ rule, data, activeBlock, onEdit, onHistory, onDelete }: {
	rule: SpendRule;
	data: SettingsSpendAlertsData;
	/** The rule's active block, if it is blocking requests now. */
	activeBlock: SpendBlock | null;
	onEdit: () => void;
	onHistory: () => void;
	onDelete: () => void;
}) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const format = useDisplayFormatters();
	const usd = useSpendUsd();
	const percentText = useSpendPercent();
	const balanceSummary = useBalanceSummary();
	const scopeLabel = useScopeLabel(data.options);
	const summarize = useRuleSummary();
	const actionError = useSpendActionError();
	const write = useSettingsWrite();
	const canManage = data.canManageSpendRules;
	const [enabled, setEnabled] = useState(rule.enabled);
	const [busy, setBusy] = useState(false);
	const preview = data.previews[rule.id] ?? null;
	const summary = previewSummary(preview, rule);
	const lastFired = preview?.state?.last_fired_at ?? null;
	const period = rule.period === "rolling" ? t("period.rollingHours", { hours: rule.window_hours ?? 0 }) : t(`period.${rule.period}`);

	async function toggle(next: boolean) {
		setEnabled(next);
		setBusy(true);
		const result = await write(updateSpendRule(rule.id, { enabled: next }));
		setBusy(false);
		if (result.ok === false) {
			setEnabled(!next);
			toast.error(actionError(result, data.maxRules));
			return;
		}
		toast.success(next ? t("toast.enabled") : t("toast.disabled"));
	}

	async function sendTest() {
		setBusy(true);
		const result = await testSpendRule(rule.id);
		setBusy(false);
		if (result.ok === false) {
			toast.error(actionError(result, data.maxRules));
			return;
		}
		if (result.result.failed > 0) toast.warning(t("toast.testPartial", { delivered: result.result.delivered, failed: result.result.failed }));
		else toast.success(t("toast.testSent", { count: result.result.delivered }));
	}

	return (
		<li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<button type="button" className="truncate text-left text-sm font-medium hover:underline" onClick={onEdit}>{rule.name}</button>
					{!rule.evaluated ? <Badge variant="outline" className="rounded-md" title={t("badges.notEvaluatedHelp")}>{t("badges.notEvaluated")}</Badge> : null}
					{activeBlock ? <Badge variant="destructive" className="rounded-md" title={t("badges.blockingNowHelp")}>{t("badges.blockingNow")}</Badge>
						: rule.action === "block" ? <Badge variant="secondary" className="rounded-md">{t("badges.blocks", { percent: rule.block_at_percent })}</Badge> : null}
					{!enabled ? <Badge variant="outline" className="rounded-md text-muted-foreground">{t("badges.disabled")}</Badge> : null}
				</div>
				<p className="mt-0.5 truncate text-sm text-muted-foreground">
					{[scopeLabel(rule.scope_type, rule.scope_id), t(`metric.${rule.metric}`), period].join(" · ")}
				</p>
				<p className="mt-0.5 truncate text-xs text-muted-foreground">{summarize(rule)}</p>
			</div>
			<div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
				<div className="text-right text-xs tabular-nums">
					{summary?.kind === "ofBase" ? (
						<p className="text-sm font-medium" title={t("preview.ofBase", { value: usd(summary.valueUsd), base: usd(summary.baseUsd), percent: percentText(summary.percent) })}>
							{percentText(summary.percent)}
							<span className="ml-1.5 text-xs font-normal text-muted-foreground">{t("row.ofBase", { value: usd(summary.valueUsd), base: usd(summary.baseUsd) })}</span>
						</p>
					) : summary?.kind === "value" ? (
						<p className="text-sm font-medium">{usd(summary.valueUsd)}</p>
					) : summary?.kind === "balance" ? (
						<p className="text-sm font-medium" title={balanceSummary.text(summary)}>
							{usd(summary.availableUsd)}
							{summary.runwayDays !== null ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{balanceSummary.runway(summary.runwayDays)}</span> : null}
						</p>
					) : null}
					{rule.evaluated && rule.enabled ? (
						<p className="text-muted-foreground">
							{lastFired ? t("row.lastFired", { date: format.dateParts(lastFired, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }) : t("row.neverFired")}
						</p>
					) : null}
				</div>
				<Switch checked={enabled} disabled={!canManage || busy} aria-label={t("row.enabled", { name: rule.name })} onCheckedChange={(checked) => void toggle(Boolean(checked))} />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button type="button" variant="ghost" size="icon-sm" className="rounded-md" aria-label={t("row.actions", { name: rule.name })} disabled={busy}><MoreHorizontal className="size-4" /></Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onEdit}><Pencil className="size-4" />{canManage ? t("row.edit") : t("row.view")}</DropdownMenuItem>
						<DropdownMenuItem onClick={onHistory}><History className="size-4" />{t("row.history")}</DropdownMenuItem>
						{canManage ? (
							<>
								<DropdownMenuItem onClick={() => void sendTest()}><Send className="size-4" />{t("row.sendTest")}</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 className="size-4" />{t("row.delete")}</DropdownMenuItem>
							</>
						) : null}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</li>
	);
}

function DeleteSpendRuleDialog({ rule, maxRules, onClose }: { rule: SpendRule | null; maxRules: number; onClose: () => void }) {
	const t = useTranslations("SettingsUI.spendAlerts");
	const write = useSettingsWrite();
	const actionError = useSpendActionError();
	const [deleting, setDeleting] = useState(false);

	async function confirm() {
		if (!rule) return;
		setDeleting(true);
		const result = await write(deleteSpendRule(rule.id));
		setDeleting(false);
		if (result.ok === false) {
			toast.error(actionError(result, maxRules));
			return;
		}
		toast.success(t("toast.deleted"));
		onClose();
	}

	return (
		<AlertDialog open={rule !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<AlertDialogContent className="rounded-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("delete.title", { name: rule?.name ?? "" })}</AlertDialogTitle>
					<AlertDialogDescription>{t("delete.body")}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="rounded-md" disabled={deleting}>{t("delete.cancel")}</AlertDialogCancel>
					<AlertDialogAction variant="destructive" className="rounded-md" disabled={deleting} onClick={() => void confirm()}>
						{deleting ? t("delete.deleting") : t("delete.confirm")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
