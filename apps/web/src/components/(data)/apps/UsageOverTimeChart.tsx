"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppUsageRow } from "@/lib/fetchers/apps/getAppUsageOverTime";
import AppUsageChart from "./AppUsageChart";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

export default function UsageOverTimeChart({
	appId,
	range = "1m"
}: {
	appId: string;
	range?: RangeKey;
}) {
	const [rows, setRows] = useState<AppUsageRow[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function loadRows() {
			setLoading(true);
			try {
				const response = await fetch(
					`/api/frontend/apps/${encodeURIComponent(appId)}/usage?range=${range}`,
					{ headers: { accept: "application/json" } },
				);
				const data = response.ok ? ((await response.json()) as AppUsageRow[]) : [];
				if (!cancelled) setRows(data);
			} catch {
				if (!cancelled) setRows([]);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}

		loadRows();
		return () => {
			cancelled = true;
		};
	}, [appId, range]);

	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Usage Over Time</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="animate-pulse h-64 bg-gray-200 rounded"></div>
				</CardContent>
			</Card>
		);
	}

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
