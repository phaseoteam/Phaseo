import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppUsageOverTime } from "@/lib/fetchers/apps/getAppUsageOverTime";
import { TrendingUp, Zap } from "lucide-react";

type RangeKey = "1h" | "1d" | "1w" | "4w" | "1m" | "1y";

type ModelStats = {
	model: string;
	requests: number;
	tokens: number;
};

export default async function TopModelsForApp({
	appId,
	range = "1m"
}: {
	appId: string;
	range?: RangeKey;
}) {
	const rows = await getAppUsageOverTime(appId, range);

	// Aggregate by model
	const modelAgg = new Map<string, {
		requests: number;
		tokens: number;
	}>();

	for (const row of rows) {
		if (!row.success) continue;

		const model = row.model_id || "unknown";
		const m = modelAgg.get(model) || { requests: 0, tokens: 0 };

		m.requests += Number(row.requests ?? 1);
		m.tokens += row.usage?.total_tokens ? Number(row.usage.total_tokens) : 0;

		modelAgg.set(model, m);
	}

	const topModels = Array.from(modelAgg.entries())
		.map(([model, stats]) => ({
			model,
			requests: stats.requests,
			tokens: stats.tokens,
		}))
		.sort((a, b) => b.tokens - a.tokens) // Sort by tokens instead of requests
		.slice(0, 6);

	if (!topModels.length) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Top Models Used</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground">No model usage data available for this time period.</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Top Models Used</CardTitle>
				<p className="text-sm text-muted-foreground">
					Models ranked by token consumption for this app
				</p>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{topModels.map((model, index) => (
						<div key={model.model} className="flex items-center justify-between p-3 border rounded-lg">
							<div className="flex items-center gap-3">
								<div className="text-sm font-medium text-muted-foreground">
									#{index + 1}
								</div>
								<div>
									<div className="font-medium">{model.model}</div>
									<div className="text-sm text-muted-foreground">
										{model.requests} requests
									</div>
								</div>
							</div>
							<div className="text-right">
								<div className="flex items-center gap-1 text-sm">
									<Zap className="h-3 w-3" />
									{model.tokens.toLocaleString()} tokens
								</div>
							</div>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
