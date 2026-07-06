"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppUsageRow } from "@/lib/fetchers/apps/getAppUsageOverTime";
import AppUsageChart from "./AppUsageChart";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

export default function UsageOverTimeChart({
	range = "1m",
	rows = [],
}: {
	appId?: string;
	range?: RangeKey;
	rows?: AppUsageRow[];
}) {
	if (!rows.length) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Usage Over Time</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">No usage data available for this time period.</p>
				</CardContent>
			</Card>
		);
	}

	const windowLabel = `${range} period`;

	return <AppUsageChart rows={rows} windowLabel={windowLabel} />;
}
