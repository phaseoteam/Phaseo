"use client";

import { useTranslations } from "next-intl";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import type { KeyDetailData } from "@/lib/fetchers/internal/fetchSettingsKeyDetail";

export function KeyUsageSummary({ usage }: { usage: KeyDetailData["usage"] }) {
	const t = useTranslations("SettingsUI");
	const format = useDisplayFormatters();
	if (usage === null) return <p className="text-sm text-muted-foreground">{t("keyDetail.usageUnavailable")}</p>;
	return <div className="grid gap-4 md:grid-cols-3">
		{[[t("labels.today"), "daily"], [t("labels.thisWeek"), "weekly"], [t("labels.thisMonth"), "monthly"]].map(([label, period]) => <div key={period} className="rounded-xl border bg-card p-5">
			<h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
			<p className="mt-3 text-2xl font-semibold tabular-nums">{format.number(Number(usage[`${period}_request_count`] ?? 0))} <span className="text-sm font-normal text-muted-foreground">{t("strings.requests")}</span></p>
			<p className="mt-2 text-sm tabular-nums">{t("keyDetail.spent", { amount: format.number(Number(usage[`${period}_cost_nanos`] ?? 0) / 1e9, { style: "currency", currency: "USD", maximumFractionDigits: 4, notation: "standard" }) })}</p>
		</div>)}
	</div>;
}
