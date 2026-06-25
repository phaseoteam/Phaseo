import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchFrontendAppUsage } from "@/lib/fetchers/frontend/fetchPublicCatalog";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

function fromForRange(key: RangeKey): Date {
	const now = new Date();
	const d = new Date(now);
	if (key === "1h") d.setHours(now.getHours() - 1);
	else if (key === "1d") d.setDate(now.getDate() - 1);
	else if (key === "1w") d.setDate(now.getDate() - 7);
	else if (key === "1m") d.setMonth(now.getMonth() - 1);
	else if (key === "1y") d.setFullYear(now.getFullYear() - 1);
	return d;
}

export default async function AppUsageStats({
	appId,
	range = "1m"
}: {
	appId: string;
	range?: RangeKey;
}) {
	const rows = await fetchFrontendAppUsage(appId, range);

	// Calculate current period stats
	let currentRequests = 0;
	let currentTokens = 0;

	for (const row of rows) {
		if (row.success) {
			currentRequests += Number(row.requests ?? 1);
			currentTokens += row.usage?.total_tokens ? Number(row.usage.total_tokens) : 0;
		}
	}

	// Calculate previous period stats for comparison
	const prevFrom = fromForRange(range);
	const prevTo = fromForRange(range);
	prevTo.setTime(prevTo.getTime() + (fromForRange(range).getTime() - prevFrom.getTime()));

	// For simplicity, we'll just show current stats without comparison for now
	// In a full implementation, you'd fetch previous period data

	const stats = [
		{
			label: "Total Requests",
			value: currentRequests,
			format: (v: number) => v.toLocaleString(),
		},
		{
			label: "Total Tokens",
			value: currentTokens,
			format: (v: number) => v.toLocaleString(),
		},
		{
			label: "Avg Tokens/Request",
			value: currentRequests > 0 ? currentTokens / currentRequests : 0,
			format: (v: number) => v.toFixed(1),
		},
	];

	return (
		<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
			{stats.map((stat) => (
				<Card key={stat.label}>
					<CardHeader className="pb-3">
						<CardTitle className="text-lg">{stat.label}</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{stat.format(stat.value)}
						</div>
						<p className="text-xs text-muted-foreground mt-1">
							{range} period
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
