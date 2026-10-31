import type { UseSuspenseQueryOptions } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import ProviderTokenUsageChartClient from "@/components/(data)/api-providers/Gateway/ProviderTokenUsageChartClient";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import {
	providerMarketShareTimeseriesQuery,
	providerNamesByIdsQuery,
} from "./apiProvider.queries";
import type {
	ProviderTokenSeriesModel,
	ProviderTokenSeriesPoint,
} from "@/lib/fetchers/api-providers/providerDataTypes";
import { useTranslations } from "@/i18n/react";

// Conditional query tuples; each result is read with its own cast.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuspenseQueryList = UseSuspenseQueryOptions<any, Error, any, any>[];

export default function ProvidersTokenUsageChart() {
	const t = useTranslations("Catalogue.providers");
	const { data: { data } } = useSuspenseQuery(providerMarketShareTimeseriesQuery());
	const filtered = (data ?? []).filter(
		(row) => row.name && row.name.toLowerCase() !== "unknown",
	);

	const totalsByProvider = new Map<string, number>();
	for (const row of filtered) {
		const providerId = row.name;
		const current = totalsByProvider.get(providerId) ?? 0;
		totalsByProvider.set(providerId, current + Number(row.tokens ?? 0));
	}

	const providerIds = Array.from(totalsByProvider.keys());
	// Names are only fetched when there is usage to chart.
	const providerNamesQueries = useSuspenseQueries({
		queries: (filtered.length ? [providerNamesByIdsQuery(providerIds)] : []) as SuspenseQueryList,
	});

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

	const providerNames = (providerNamesQueries[0]?.data ?? {}) as Record<string, string>;

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
