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
	fetchFrontendMarketShareTimeseries,
	fetchFrontendProviderNamesByIds,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type {
	ProviderTokenSeriesModel,
	ProviderTokenSeriesPoint,
} from "@/lib/fetchers/api-providers/providerDataTypes";
import { getTranslations } from "next-intl/server";

export default async function ProvidersTokenUsageChart() {
	const t = await getTranslations("Catalogue.providers");
	const { data } = await fetchFrontendMarketShareTimeseries(
		"provider",
		"month",
		"day",
		8,
	);
	const filtered = (data ?? []).filter(
		(row) => row.name && row.name.toLowerCase() !== "unknown",
	);

	if (!filtered.length) {
		return (
			<section className="space-y-2">
				<div>
					<h2 className="text-2xl font-semibold">{t("totalTokensOverTime")}</h2>
					<p className="text-sm text-muted-foreground">
						{t("dailyProviderTokensDescription")}
					</p>
				</div>
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BarChart3 />
						</EmptyMedia>
						<EmptyTitle>{t("noTokenUsageYet")}</EmptyTitle>
						<EmptyDescription>
							{t("providerTokenChartWillPopulate")}
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
	const providerNames = await fetchFrontendProviderNamesByIds(providerIds);

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
				<h2 className="text-2xl font-semibold">{t("totalTokensOverTime")}</h2>
				<p className="text-sm text-muted-foreground">
					{t("dailyProviderTokensDescription")}
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
