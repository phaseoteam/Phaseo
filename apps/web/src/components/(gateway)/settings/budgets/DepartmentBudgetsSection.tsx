"use client";

import { useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { ForecastMeter } from "@/components/(gateway)/usage/ForecastMeter";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { formatLimitResetCountdown } from "@/lib/gateway/usage/limitForecast";
import type { SettingsBudgetsInitialData, SettingsDepartmentBudget } from "@/lib/fetchers/internal/settingsTypes";
import {
	createDepartmentBudget,
	deleteDepartmentBudget,
	updateDepartmentBudget,
	type DepartmentBudgetActionResult,
} from "@/app/(dashboard)/settings/budgets/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { useLimitClock } from "../keys/useLimitClock";
import { BUDGET_WINDOWS, budgetPercentFraction, budgetTone } from "./budgetForecast";
import { useUsd } from "./BudgetsSettingsClient";
import { departmentsWithFreeIntervals, freeDepartmentIntervals, sortDepartmentBudgets, type DepartmentBudgetInterval } from "./departmentBudgets";
import { parseBudgetLimitUsd } from "./workspaceBudgets";

type Department = { id: string; name: string };
type Editing = { mode: "create" } | { mode: "edit"; budget: SettingsDepartmentBudget };

/**
 * Department budgets under the workspace budgets. At 100% the gateway refuses the
 * department's API-key requests (batch, realtime and OAuth requests excepted);
 * owners and admins are pushed at about 80% and 100%.
 */
export default function DepartmentBudgetsSection({ data }: { data: SettingsBudgetsInitialData }) {
	const t = useTranslations("SettingsUI.budgets");
	const [editing, setEditing] = useState<Editing | null>(null);
	const [deleting, setDeleting] = useState<SettingsDepartmentBudget | null>(null);
	if (!data.workspaceId || data.departmentBudgets === undefined) return null;
	const budgets = sortDepartmentBudgets(data.departmentBudgets ?? []);
	const departments = data.departments ?? [];
	const canAdd = data.canManageBudgets && departmentsWithFreeIntervals(departments, budgets).length > 0;
	const observedAt = Date.parse(data.observedAt) || 0;

	return (
		<section className="space-y-3">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-base font-semibold">{t("departments.title")}</h2>
						<Badge variant="outline" className="rounded-md">{t("departments.blocksAtLimit")}</Badge>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">{t("departments.description")}</p>
				</div>
				{canAdd ? (
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={() => setEditing({ mode: "create" })}>
						<Plus className="h-4 w-4" />
						{t("departments.add")}
					</Button>
				) : null}
			</div>
			{data.departmentBudgets === null ? (
				<p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">{t("departments.unavailable")}</p>
			) : budgets.length ? (
				<ul className="divide-y rounded-md border">
					{budgets.map((budget) => (
						<DepartmentBudgetRow
							key={budget.id}
							budget={budget}
							observedAt={observedAt}
							canManage={data.canManageBudgets}
							onEdit={() => setEditing({ mode: "edit", budget })}
							onDelete={() => setDeleting(budget)}
						/>
					))}
				</ul>
			) : (
				<p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
					{departments.length
						? t("departments.empty")
						: t.rich("departments.noDepartments", {
							link: (chunks) => <Link href="/settings/workspaces/enterprise/departments" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link>,
						})}
				</p>
			)}
			<p className="text-xs text-muted-foreground">{t("departments.spendNote")}</p>
			<DepartmentBudgetDialog editing={editing} budgets={budgets} departments={departments} onClose={() => setEditing(null)} />
			<DeleteDepartmentBudgetDialog budget={deleting} onClose={() => setDeleting(null)} />
		</section>
	);
}

function DepartmentBudgetRow({
	budget,
	observedAt,
	canManage,
	onEdit,
	onDelete,
}: {
	budget: SettingsDepartmentBudget;
	observedAt: number;
	canManage: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const t = useTranslations("SettingsUI.budgets");
	const format = useDisplayFormatters();
	const usd = useUsd();
	// Countdowns follow the live clock once mounted, and the read time before that.
	const now = useLimitClock() ?? observedAt;
	const window = BUDGET_WINDOWS[budget.interval];
	const tone = budgetTone(budget);
	const percent = budgetPercentFraction(budget);
	const percentText = format.number(percent.fraction, { style: "percent", maximumFractionDigits: percent.digits, minimumFractionDigits: 0 });
	const resetDate = budget.reset_at
		? format.dateParts(budget.reset_at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
		: null;
	const name = budget.department_name ?? t("departments.unnamed");

	return (
		<li data-department-budget-id={budget.id} className="px-4 py-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<h3 className="truncate text-sm font-semibold">{name}</h3>
					<span className="text-sm text-muted-foreground">{t(`interval.${budget.interval}`)}</span>
					{tone === "exceeded" ? <Badge variant="destructive" className="rounded-md">{t("departments.reached")}</Badge> : null}
				</div>
				{canManage ? (
					<div className="flex flex-wrap items-center gap-1">
						<Button type="button" variant="ghost" size="sm" className="rounded-md" onClick={onEdit}>
							<Pencil className="h-4 w-4" />
							{t("edit")}
						</Button>
						<Button type="button" variant="ghost" size="sm" className="rounded-md hover:text-destructive" onClick={onDelete}>
							<Trash2 className="h-4 w-4" />
							{t("delete")}
						</Button>
					</div>
				) : null}
			</div>
			<p className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
				<span className="text-lg font-semibold tracking-tight tabular-nums">{usd(budget.usage_usd)}</span>
				<span className="text-sm tabular-nums text-muted-foreground">{t("ofLimit", { limit: usd(budget.limit_usd) })}</span>
			</p>
			<ForecastMeter
				className="mt-2"
				used={budget.usage_usd}
				limit={budget.limit_usd}
				label={t("meterLabel", { period: t(`period.${budget.interval}`), used: usd(budget.usage_usd), limit: usd(budget.limit_usd) })}
			/>
			<div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs tabular-nums">
				<span className={tone === "ok" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}>
					{t("percentUsed", { percent: percentText })}
					{" · "}
					{t("remaining", { amount: usd(budget.remaining_nanos / 1e9) })}
				</span>
				{window && resetDate ? (
					<span className="text-muted-foreground">{t("resets", { time: formatLimitResetCountdown(window, now), date: resetDate })}</span>
				) : null}
			</div>
		</li>
	);
}

function errorKey(result: DepartmentBudgetActionResult) {
	if (result.ok) return null;
	if (result.status === 409) return "departments.errorConflict" as const;
	if (result.status === 401 || result.status === 403) return "errorForbidden" as const;
	if (result.status === 404) return "departments.errorNotFound" as const;
	if (result.status === 400) return "errorInvalid" as const;
	return "errorFailed" as const;
}

function DepartmentBudgetDialog({
	editing,
	budgets,
	departments,
	onClose,
}: {
	editing: Editing | null;
	budgets: SettingsDepartmentBudget[];
	departments: Department[];
	onClose: () => void;
}) {
	const t = useTranslations("SettingsUI.budgets");
	const formKey = editing ? (editing.mode === "edit" ? editing.budget.id : "new") : "closed";
	return (
		<Dialog open={editing !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md">
				{editing
					? <DepartmentBudgetForm key={formKey} editing={editing} budgets={budgets} departments={departments} onDone={onClose} />
					: <DialogTitle className="sr-only">{t("departments.title")}</DialogTitle>}
			</DialogContent>
		</Dialog>
	);
}

function DepartmentBudgetForm({
	editing,
	budgets,
	departments,
	onDone,
}: {
	editing: Editing;
	budgets: SettingsDepartmentBudget[];
	departments: Department[];
	onDone: () => void;
}) {
	const t = useTranslations("SettingsUI.budgets");
	const write = useSettingsWrite();
	const existing = editing.mode === "edit" ? editing.budget : null;
	const choices = departmentsWithFreeIntervals(departments, budgets);
	const [departmentId, setDepartmentId] = useState(existing?.department_id ?? (choices.length === 1 ? choices[0]!.id : ""));
	const free = departmentId ? freeDepartmentIntervals(budgets, departmentId) : [];
	const [chosenInterval, setChosenInterval] = useState<DepartmentBudgetInterval>("monthly");
	const interval = existing?.interval ?? (free.includes(chosenInterval) ? chosenInterval : free[0] ?? "monthly");
	const [value, setValue] = useState(existing ? String(existing.limit_usd) : "");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const inputId = `department-budget-limit-${existing?.id ?? "new"}`;

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const limit = parseBudgetLimitUsd(value);
		if (limit === null) {
			setError(t("errorInvalid"));
			return;
		}
		if (!existing && !departmentId) {
			setError(t("departments.errorDepartment"));
			return;
		}
		setSaving(true);
		setError(null);
		const result = await write(existing
			? updateDepartmentBudget(existing.id, limit)
			: createDepartmentBudget(departmentId, interval, limit));
		setSaving(false);
		const key = errorKey(result);
		if (key) {
			setError(t(key));
			return;
		}
		toast.success(t("departments.saved"));
		onDone();
	}

	return (
		<form onSubmit={submit} className="grid gap-6">
			<DialogHeader>
				<DialogTitle>{existing ? t("departments.editTitle") : t("departments.createTitle")}</DialogTitle>
				<DialogDescription>{t("departments.limitHelp")}</DialogDescription>
			</DialogHeader>
			<div className="grid gap-4">
				{existing ? (
					<p className="text-sm">
						<span className="font-medium">{existing.department_name ?? t("departments.unnamed")}</span>
						<span className="text-muted-foreground"> · {t(`interval.${existing.interval}`)}</span>
					</p>
				) : (
					<div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]">
						<div className="grid gap-2">
							<Label>{t("departments.department")}</Label>
							<SearchableSelect
								label={t("departments.department")}
								value={departmentId}
								options={choices.map((department) => ({ value: department.id, label: department.name }))}
								onValueChange={setDepartmentId}
								disabled={saving}
								placeholder={t("departments.chooseDepartment")}
								triggerClassName="w-full rounded-md"
							/>
						</div>
						<div className="grid gap-2">
							<Label>{t("departments.period")}</Label>
							<Select value={interval} disabled={saving || !departmentId} onValueChange={(next) => setChosenInterval(next as DepartmentBudgetInterval)}>
								<SelectTrigger className="w-full rounded-md" aria-label={t("departments.period")}><SelectValue>{t(`interval.${interval}`)}</SelectValue></SelectTrigger>
								<SelectContent>
									{(departmentId ? free : []).map((option) => <SelectItem key={option} value={option}>{t(`interval.${option}`)}</SelectItem>)}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}
				<div className="grid gap-2">
					<Label htmlFor={inputId}>{t("limitLabel")}</Label>
					<Input
						id={inputId}
						type="number"
						inputMode="decimal"
						min="0"
						step="any"
						autoFocus={Boolean(existing)}
						required
						value={value}
						aria-invalid={error ? true : undefined}
						aria-describedby={error ? `${inputId}-error` : undefined}
						onChange={(event) => setValue(event.target.value)}
					/>
					{error ? <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
				</div>
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" className="rounded-md" onClick={onDone} disabled={saving}>{t("cancel")}</Button>
				<Button type="submit" className="rounded-md" disabled={saving}>{saving ? t("saving") : t("save")}</Button>
			</DialogFooter>
		</form>
	);
}

function DeleteDepartmentBudgetDialog({ budget, onClose }: { budget: SettingsDepartmentBudget | null; onClose: () => void }) {
	const t = useTranslations("SettingsUI.budgets");
	const write = useSettingsWrite();
	const [deleting, setDeleting] = useState(false);

	async function confirm() {
		if (!budget) return;
		setDeleting(true);
		const result = await write(deleteDepartmentBudget(budget.id));
		setDeleting(false);
		const key = errorKey(result);
		if (key) {
			toast.error(t(key));
			return;
		}
		toast.success(t("departments.deleted"));
		onClose();
	}

	return (
		<AlertDialog open={budget !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<AlertDialogContent className="rounded-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("departments.deleteTitle")}</AlertDialogTitle>
					<AlertDialogDescription>
						{budget ? t("departments.deleteBody", { department: budget.department_name ?? t("departments.unnamed") }) : null}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel className="rounded-md" disabled={deleting}>{t("cancel")}</AlertDialogCancel>
					<AlertDialogAction variant="destructive" className="rounded-md" disabled={deleting} onClick={() => void confirm()}>
						{deleting ? t("deleting") : t("delete")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
