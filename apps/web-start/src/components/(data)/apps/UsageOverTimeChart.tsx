"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppUsageRow } from "@/lib/fetchers/apps/types";
import AppUsageChart from "./AppUsageChart";
import { useTranslations } from "next-intl";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

export default function UsageOverTimeChart({
	range = "1m",
	rows = [],
}: {
	appId?: string;
	range?: RangeKey;
	rows?: AppUsageRow[];
}) {
	const t = useTranslations("Catalogue.appDetail");
	if (!rows.length) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>{t("usageOverTime")}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">{t("noUsageDataForPeriod")}</p>
				</CardContent>
			</Card>
		);
	}

	const windowLabel = t("rangePeriod", { range });

	return <AppUsageChart rows={rows} windowLabel={windowLabel} />;
}
