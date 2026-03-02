import { BarChart3 } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import ProviderTokenUsageChartClient from "@/components/(data)/api-providers/Gateway/ProviderTokenUsageChartClient";
import {
	getMarketShareTimeseries,
	getProviderNamesByIds,
} from "@/lib/fetchers/rankings/getRankingsData";
import type {
	ProviderTokenSeriesModel,
	ProviderTokenSeriesPoint,
} from "@/lib/fetchers/api-providers/api-provider/providerTokenTimeseries";

export default async function ProvidersTokenUsageChart() {
	const { data } = await getMarketShareTimeseries("provider", "month", "day", 8);
	const filtered = (data ?? []).filter(
		(row) => row.name && row.name.toLowerCase() !== "unknown",
	);

	if (!filtered.length) {
		return (
			<section className="space-y-2">
				<div>
					<h2 className="text-2xl font-semibold">Total tokens over time</h2>
					<p className="text-sm text-muted-foreground">
						Daily token usage split by top providers over the last 30 days.
					</p>
				</div>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BarChart3 />
						</EmptyMedia>
						<EmptyTitle>No token usage yet</EmptyTitle>
						<EmptyDescription>
							This chart will populate when provider usage data is available.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</section>
		);
	}

	const totalsByProvider = new Map<string, number>();
	for (const row of filtered) {
		const providerId = row.name;
		const current = totalsByProvider.get(providerId) ?? 0;
		totalsByProvider.set(providerId, current + Number(row.tokens ?? 0));
	}

	const providerIds = Array.from(totalsByProvider.keys());
	const providerNames = await getProviderNamesByIds(providerIds);

	const models: ProviderTokenSeriesModel[] = providerIds
		.map((providerId) => ({
			modelId: providerId,
			modelName: providerNames[providerId] ?? providerId,
			totalTokens: totalsByProvider.get(providerId) ?? 0,
		}))
		.sort((a, b) => b.totalTokens - a.totalTokens);

	const points: ProviderTokenSeriesPoint[] = filtered.map((row) => ({
		bucket: row.bucket,
		modelId: row.name,
		tokens: Number(row.tokens ?? 0),
	}));

	return (
		<section className="space-y-2">
			<div>
				<h2 className="text-2xl font-semibold">Total tokens over time</h2>
				<p className="text-sm text-muted-foreground">
					Daily token usage split by top providers over the last 30 days.
				</p>
			</div>
			<ProviderTokenUsageChartClient
				models={models}
				points={points}
				showLinkedTables={false}
			/>
		</section>
	);
}
