"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { setBillingTimeZone, setDepartmentSpendAttribution } from "@/app/(dashboard)/settings/credits/actions";
import { useSettingsWrite } from "../PrivateSettingsQuery";
import { OptionTiles } from "./spendAlertsUi";
import { timeZoneOptions } from "./spendRuleDraft";

export type DepartmentSpendAttribution = "all" | "primary";

/**
 * Workspace-wide spend settings: the billing time zone that calendar alerts (and later spend
 * reports) follow, and how a person in several departments counts toward department alerts.
 * Owners and admins change them; everyone else sees them read-only.
 */
export function SpendWorkspaceSettings({ billingTimeZone, departmentSpendAttribution, canManage }: {
	billingTimeZone: string;
	departmentSpendAttribution: DepartmentSpendAttribution;
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
		</div>
	);
}
