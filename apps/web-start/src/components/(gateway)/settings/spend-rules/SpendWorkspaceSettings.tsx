"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { setBillingTimeZone, setDepartmentSpendAttribution, setSpendReportSettings } from "@/app/(dashboard)/settings/credits/actions";
import type { SpendReportCadence } from "@/lib/fetchers/internal/settingsTypes";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { OptionTiles } from "./spendAlertsUi";
import { timeZoneOptions } from "./spendRuleDraft";

export type DepartmentSpendAttribution = "all" | "primary";

/**
 * Workspace-wide spend settings: the billing time zone that calendar alerts and spend reports
 * follow, how a person in several departments counts toward department alerts, and how often
 * owners (and admins, when included) get the spend report email. Owners and admins change them;
 * everyone else sees them read-only.
 */
export function SpendWorkspaceSettings({ billingTimeZone, departmentSpendAttribution, reportCadence, reportIncludeAdmins, reportsEnabled, canManage }: {
	billingTimeZone: string;
	departmentSpendAttribution: DepartmentSpendAttribution;
	reportCadence: SpendReportCadence;
	reportIncludeAdmins: boolean;
	/** Whether report emails go out yet (SPEND_REPORTS_ENABLED); the choice is saved either way. */
	reportsEnabled: boolean;
	canManage: boolean;
}) {
	const t = useTranslations("SettingsUI.spendAlerts.workspace");
	const write = useSettingsWrite();
	const zones = useMemo(() => {
		const list = timeZoneOptions();
		return list.includes(billingTimeZone) ? list : [billingTimeZone, ...list];
	}, [billingTimeZone]);
	const [zone, setZone] = useState(billingTimeZone);
	const [attribution, setAttribution] = useState<DepartmentSpendAttribution>(departmentSpendAttribution);
	const [cadence, setCadence] = useState<SpendReportCadence>(reportCadence);
	const [includeAdmins, setIncludeAdmins] = useState(reportIncludeAdmins);

	function saveZone(next: string) {
		if (next === zone) return;
		const previous = zone;
		setZone(next);
		toast.promise(write(setBillingTimeZone(next)).catch((error) => { setZone(previous); throw error; }), {
			loading: t("saving"),
			success: t("saved"),
			error: t("saveFailed"),
		});
	}

	function saveAttribution(next: DepartmentSpendAttribution) {
		if (next === attribution) return;
		const previous = attribution;
		setAttribution(next);
		toast.promise(write(setDepartmentSpendAttribution(next)).catch((error) => { setAttribution(previous); throw error; }), {
			loading: t("saving"),
			success: t("saved"),
			error: t("saveFailed"),
		});
	}

	function saveCadence(next: SpendReportCadence) {
		if (next === cadence) return;
		const previous = cadence;
		setCadence(next);
		toast.promise(write(setSpendReportSettings({ cadence: next })).catch((error) => { setCadence(previous); throw error; }), {
			loading: t("saving"),
			success: t("saved"),
			error: t("saveFailed"),
		});
	}

	function saveIncludeAdmins(next: boolean) {
		if (next === includeAdmins) return;
		setIncludeAdmins(next);
		toast.promise(write(setSpendReportSettings({ includeAdmins: next })).catch((error) => { setIncludeAdmins(!next); throw error; }), {
			loading: t("saving"),
			success: t("saved"),
			error: t("saveFailed"),
		});
	}

	return (
		<div className="divide-y rounded-md border bg-background/40">
			<div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-start">
				<div className="min-w-0">
					<Label htmlFor="billing-time-zone" className="text-sm font-medium">{t("timeZone")}</Label>
					<p className="mt-0.5 text-sm text-muted-foreground">{t("timeZoneHelp")}</p>
					<p className="mt-1 text-xs text-muted-foreground">{t("utcNote")}</p>
				</div>
				<SearchableSelect
					id="billing-time-zone"
					label={t("timeZone")}
					value={zone}
					options={zones.map((value) => ({ value, label: value }))}
					disabled={!canManage}
					onValueChange={saveZone}
					triggerClassName="w-full rounded-md"
				/>
			</div>
			<div className="space-y-3 px-4 py-4">
				<div>
					<h3 className="text-sm font-medium">{t("attribution")}</h3>
					<p className="mt-0.5 text-sm text-muted-foreground">{t("attributionHelp")}</p>
				</div>
				<OptionTiles
					label={t("attribution")}
					value={attribution}
					onChange={saveAttribution}
					disabled={!canManage}
					options={[
						{ value: "all", title: t("attributionAll"), description: t("attributionAllHelp") },
						{ value: "primary", title: t("attributionPrimary"), description: t("attributionPrimaryHelp") },
					]}
				/>
				<p className="text-xs text-muted-foreground">{t("attributionNote")}</p>
			</div>
			<div className="space-y-3 px-4 py-4" id="spend-report">
				<div>
					<h3 className="text-sm font-medium">{t("report")}</h3>
					<p className="mt-0.5 text-sm text-muted-foreground">{t("reportHelp")}</p>
				</div>
				<OptionTiles
					label={t("report")}
					value={cadence}
					onChange={saveCadence}
					disabled={!canManage}
					className="sm:grid-cols-4"
					options={[
						{ value: "off", title: t("reportOff"), description: t("reportOffHelp") },
						{ value: "daily", title: t("reportDaily"), description: t("reportDailyHelp") },
						{ value: "weekly", title: t("reportWeekly"), description: t("reportWeeklyHelp") },
						{ value: "monthly", title: t("reportMonthly"), description: t("reportMonthlyHelp") },
					]}
				/>
				<div className="flex items-start gap-3">
					<Checkbox
						id="spend-report-include-admins"
						checked={includeAdmins}
						disabled={!canManage || cadence === "off"}
						onCheckedChange={(checked) => saveIncludeAdmins(checked === true)}
						className="mt-0.5"
					/>
					<div className="min-w-0">
						<Label htmlFor="spend-report-include-admins" className="text-sm font-medium">{t("reportIncludeAdmins")}</Label>
						<p className="mt-0.5 text-xs text-muted-foreground">{t("reportIncludeAdminsHelp")}</p>
					</div>
				</div>
				<p className="text-xs text-muted-foreground">{t("reportNote")}</p>
				{reportsEnabled ? null : <p className="text-xs font-medium text-foreground">{t("reportsOff")}</p>}
			</div>
		</div>
	);
}
