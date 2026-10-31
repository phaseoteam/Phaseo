"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "@/i18n/react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import type { SettingsBudgetsInitialData, SettingsWorkspaceBudget } from "@/lib/fetchers/internal/settingsTypes";
import {
	createWorkspaceBudget,
	deleteWorkspaceBudget,
	updateWorkspaceBudget,
	type BudgetActionResult,
} from "@/app/(dashboard)/settings/budgets/actions";
import { useInvalidatePrivateSettings, useSettingsWrite } from "../PrivateSettingsQuery";
import { useLimitClock } from "../keys/useLimitClock";
import { BUDGET_WINDOWS, budgetPercentFraction, budgetProjection, budgetSlots, budgetTone } from "./budgetForecast";
import { parseBudgetLimitUsd, type BudgetInterval } from "./workspaceBudgets";

/** Anchor for one interval's row, e.g. /settings/budgets#budget-monthly. */
export function budgetRowAnchor(interval: BudgetInterval): string {
	return `budget-${interval}`;
}

type Editing = { interval: BudgetInterval; budget: SettingsWorkspaceBudget | null };

function Notice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

export default function BudgetsSettingsClient({
	data,
	renderBudgetActions,
}: {
	data: SettingsBudgetsInitialData;
	/** Extra per-budget actions for managers, such as an alert shortcut. */
	renderBudgetActions?: (budget: SettingsWorkspaceBudget) => ReactNode;
}) {
	const t = useTranslations("SettingsUI.budgets");
	const [editing, setEditing] = useState<Editing | null>(null);
	const [deleting, setDeleting] = useState<SettingsWorkspaceBudget | null>(null);
	useRefreshAtBudgetReset([...data.budgets, ...(data.departmentBudgets ?? [])]);
	if (!data.workspaceId) return <Notice>{t("selectWorkspace")}</Notice>;
	// The API always sends the database time; without it there is simply no projection.
	const observedAt = Date.parse(data.observedAt) || 0;

	return (
		<div className="space-y-4">
			<div className="space-y-1.5 rounded-md border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				<p>{t("howItWorks")}</p>
				<p>{t("utcNote")}</p>
				<p>
					{t.rich("keyLimitsHint", {
						link: (chunks) => <Link href="/settings/keys" className="underline underline-offset-3 hover:text-foreground">{chunks}</Link>,
					})}
				</p>
			</div>
			<ul className="divide-y rounded-md border">
				{budgetSlots(data.budgets).map((slot) => (
					<BudgetRow
						key={slot.interval}
						interval={slot.interval}
						budget={slot.budget}
						observedAt={observedAt}
						canManage={data.canManageBudgets}
						onEdit={() => setEditing({ interval: slot.interval, budget: slot.budget })}
						onDelete={() => slot.budget && setDeleting(slot.budget)}
						extraActions={slot.budget && data.canManageBudgets ? renderBudgetActions?.(slot.budget) : null}
					/>
				))}
			</ul>
			<p className="text-xs text-muted-foreground">{data.canManageBudgets ? t("usageNote") : t("readOnly")}</p>
			<BudgetDialog editing={editing} onClose={() => setEditing(null)} />
			<DeleteBudgetDialog budget={deleting} onClose={() => setDeleting(null)} />
		</div>
	);
}

/** The earliest reset time in ms, or null when no budget resets (lifetime only). */
export function nextBudgetReset(budgets: Array<Pick<SettingsWorkspaceBudget, "reset_at">>): number | null {
	return budgets.reduce<number | null>((earliest, budget) => {
		const resetAt = budget.reset_at ? Date.parse(budget.reset_at) : Number.NaN;
		return Number.isFinite(resetAt) && (earliest === null || resetAt < earliest) ? resetAt : earliest;
	}, null);
}

/** Refetch once the earliest budget window (workspace or department) resets, so usage and reset times don't stay on the old window. */
function useRefreshAtBudgetReset(budgets: Array<Pick<SettingsWorkspaceBudget, "reset_at">>) {
	const now = useLimitClock();
	const invalidate = useInvalidatePrivateSettings();
	const refreshedFor = useRef<number | null>(null);
	const nextReset = nextBudgetReset(budgets);
	useEffect(() => {
		if (now === null || nextReset === null || now < nextReset || refreshedFor.current === nextReset) return;
		refreshedFor.current = nextReset;
		void invalidate();
	}, [now, nextReset, invalidate]);
}

export function useUsd() {
	const format = useDisplayFormatters();
	return (value: number) => format.number(value, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: value > 0 && value < 0.01 ? 4 : 2,
		notation: "standard",
	});
}

function BudgetRow({
	interval,
	budget,
	observedAt,
	canManage,
	onEdit,
	onDelete,
	extraActions,
}: {
	interval: BudgetInterval;
	budget: SettingsWorkspaceBudget | null;
	observedAt: number;
	canManage: boolean;
	onEdit: () => void;
	onDelete: () => void;
	extraActions: ReactNode;
}) {
	const t = useTranslations("SettingsUI.budgets");
	const format = useDisplayFormatters();
	const usd = useUsd();
	// Countdowns follow the live clock; projections stay anchored to when the usage was read.
	const now = useLimitClock() ?? observedAt;
	const window = BUDGET_WINDOWS[interval];

	if (!budget) {
		return (
			<li id={budgetRowAnchor(interval)} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
				<div>
					<h3 className="text-base font-semibold">{t(`interval.${interval}`)}</h3>
					<p className="mt-0.5 text-sm text-muted-foreground">{t("notSet")}</p>
				</div>
				{canManage ? (
					<Button type="button" variant="outline" size="sm" className="rounded-md" onClick={onEdit}>
						<Plus className="h-4 w-4" />
						{t("add")}
					</Button>
				) : null}
			</li>
		);
	}

	const projection = budgetProjection(budget, observedAt);
	const tone = budgetTone(budget);
	const percent = budgetPercentFraction(budget);
	const percentText = format.number(percent.fraction, { style: "percent", maximumFractionDigits: percent.digits, minimumFractionDigits: 0 });
	const resetDate = budget.reset_at
		? format.dateParts(budget.reset_at, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
		: null;
	const meterLabel = [
		t("meterLabel", { period: t(`period.${interval}`), used: usd(budget.usage_usd), limit: usd(budget.limit_usd) }),
		projection ? t("onPaceFor", { amount: usd(projection.projected) }) : null,
	].filter(Boolean).join(", ");

	return (
		<li id={budgetRowAnchor(interval)} data-budget-id={budget.id} className="px-4 py-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-wrap items-center gap-2">
					<h3 className="text-base font-semibold">{t(`interval.${interval}`)}</h3>
					{tone === "exceeded" ? <Badge variant="destructive" className="rounded-md">{t("usedUp")}</Badge> : null}
				</div>
				{canManage ? (
					<div className="flex flex-wrap items-center gap-1">
						{extraActions}
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
			<p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
				<span className="text-2xl font-semibold tracking-tight tabular-nums">{usd(budget.usage_usd)}</span>
				<span className="text-sm tabular-nums text-muted-foreground">{t("ofLimit", { limit: usd(budget.limit_usd) })}</span>
			</p>
			<ForecastMeter className="mt-3" used={budget.usage_usd} projected={projection?.projected} limit={budget.limit_usd} label={meterLabel} />
			<div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs tabular-nums">
				<span className={tone === "ok" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}>
					{t("percentUsed", { percent: percentText })}
					{" · "}
					{t("remaining", { amount: usd(budget.remaining_nanos / 1e9) })}
				</span>
				<span className="text-muted-foreground">
					{window && resetDate
						? t("resets", { time: formatLimitResetCountdown(window, now), date: resetDate })
						: t("neverResets")}
				</span>
			</div>
			{projection ? (
				<div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs tabular-nums">
					<span className="text-muted-foreground">{t("onPaceFor", { amount: usd(projection.projected) })}</span>
					{projection.reachesLimitAt !== null ? (
						<span className="text-amber-700 dark:text-amber-300">
							{t("reachesLimit", { date: format.dateParts(projection.reachesLimitAt, interval === "daily" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }) })}
						</span>
					) : null}
				</div>
			) : null}
		</li>
	);
}

function errorKey(result: BudgetActionResult): "errorConflict" | "errorForbidden" | "errorNotFound" | "errorInvalid" | "errorFailed" | null {
	if (result.ok) return null;
	if (result.status === 409) return "errorConflict";
	if (result.status === 401 || result.status === 403) return "errorForbidden";
	if (result.status === 404) return "errorNotFound";
	if (result.status === 400) return "errorInvalid";
	return "errorFailed";
}

function BudgetDialog({ editing, onClose }: { editing: Editing | null; onClose: () => void }) {
	const t = useTranslations("SettingsUI.budgets");
	return (
		<Dialog open={editing !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="rounded-md">
				{editing ? <BudgetForm key={`${editing.interval}:${editing.budget?.id ?? "new"}`} editing={editing} onDone={onClose} /> : <DialogTitle className="sr-only">{t("title")}</DialogTitle>}
			</DialogContent>
		</Dialog>
	);
}

function BudgetForm({ editing, onDone }: { editing: Editing; onDone: () => void }) {
	const t = useTranslations("SettingsUI.budgets");
	const write = useSettingsWrite();
	const [value, setValue] = useState(editing.budget ? String(editing.budget.limit_usd) : "");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const inputId = `budget-limit-${editing.interval}`;

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const limit = parseBudgetLimitUsd(value);
		if (limit === null) {
			setError(t("errorInvalid"));
			return;
		}
		setSaving(true);
		setError(null);
		const result = await write(editing.budget
			? updateWorkspaceBudget(editing.budget.id, limit)
			: createWorkspaceBudget(editing.interval, limit));
		setSaving(false);
		const key = errorKey(result);
		if (key) {
			setError(t(key));
			return;
		}
		toast.success(result.ok && !result.gatewayCacheInvalidated ? t("savedDelayed") : t("saved"));
		onDone();
	}

	return (
		<form onSubmit={submit} className="grid gap-6">
			<DialogHeader>
				<DialogTitle>{t(editing.budget ? `editTitle.${editing.interval}` : `createTitle.${editing.interval}`)}</DialogTitle>
				<DialogDescription>{t("limitHelp")}</DialogDescription>
			</DialogHeader>
			<div className="grid gap-2">
				<Label htmlFor={inputId}>{t("limitLabel")}</Label>
				<Input
					id={inputId}
					type="number"
					inputMode="decimal"
					min="0"
					step="any"
					autoFocus
					required
					value={value}
					aria-invalid={error ? true : undefined}
					aria-describedby={error ? `${inputId}-error` : undefined}
					onChange={(event) => setValue(event.target.value)}
				/>
				{error ? <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
			</div>
			<DialogFooter>
				<Button type="button" variant="outline" className="rounded-md" onClick={onDone} disabled={saving}>{t("cancel")}</Button>
				<Button type="submit" className="rounded-md" disabled={saving}>{saving ? t("saving") : t("save")}</Button>
			</DialogFooter>
		</form>
	);
}

function DeleteBudgetDialog({ budget, onClose }: { budget: SettingsWorkspaceBudget | null; onClose: () => void }) {
	const t = useTranslations("SettingsUI.budgets");
	const write = useSettingsWrite();
	const [deleting, setDeleting] = useState(false);

	async function confirm() {
		if (!budget) return;
		setDeleting(true);
		const result = await write(deleteWorkspaceBudget(budget.id));
		setDeleting(false);
		const key = errorKey(result);
		if (key) {
			toast.error(t(key));
			return;
		}
		toast.success(t("deleted"));
		onClose();
	}

	return (
		<AlertDialog open={budget !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
			<AlertDialogContent className="rounded-md">
				<AlertDialogHeader>
					<AlertDialogTitle>{budget ? t(`deleteTitle.${budget.interval}`) : t("delete")}</AlertDialogTitle>
					<AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
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
