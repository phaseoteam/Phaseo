import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import {
	fetchFrontendModelLeaderboardMetaByIds,
	fetchFrontendRankingToolCallTimeseries,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { formatModelDisplayName } from "@/lib/models/displayName";
import { getTranslations } from "next-intl/server";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

export async function ToolCallsSection() {
	const t = await getTranslations("Catalogue.rankings");
	const result = await fetchFrontendRankingToolCallTimeseries(
		"year",
		"week",
		10,
	).catch(() => null);
	if (!result) return <RankingUnavailable id="tool-calls" title={t("toolCalls")} />;
	const modelIds = Array.from(
		new Set(
			result.data
				.map((row) => row.model_id)
				.filter(
					(id) =>
						id &&
						id.toLowerCase() !== "other" &&
						id.toLowerCase() !== "unknown",
				),
		),
	);
	const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
		(): Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>> => ({}),
	);
	const nameMap = Object.fromEntries(
		modelIds.map((modelId) => [
			modelId,
			formatModelDisplayName(metaMap[modelId]?.name, modelId),
		]),
	);
	const logoIdMap = Object.fromEntries(
		modelIds.map((modelId) => [
			modelId,
			metaMap[modelId]?.organisation_id ?? modelId,
		]),
	);
	const organisationNameMap = Object.fromEntries(
		modelIds.flatMap((modelId) => {
			const meta = metaMap[modelId] ?? null;
			return [
				[modelId, meta?.organisation_name ?? meta?.organisation_id ?? null],
				...(meta?.organisation_id
					? [[
							meta.organisation_id,
							meta.organisation_name ?? meta.organisation_id,
						]]
					: []),
			];
		}),
	);
	const modelLicenseMap = Object.fromEntries(
		modelIds.map((modelId) => [modelId, metaMap[modelId]?.license ?? null]),
	);

	return (
		<section
			id="tool-calls"
			className="scroll-mt-32 space-y-4 border-t border-border pt-12"
		>
			<div className="space-y-0.5">
				<h2 className="text-2xl font-semibold leading-8">{t("toolCalls")}</h2>
				<p className="max-w-3xl text-sm text-muted-foreground">
					{t("toolCallsDescription")}
				</p>
			</div>
			{result.data.length ? (
				<UsageStackedBar
					data={result.data}
					leaderboardData={result.data}
					metric="requests"
					nameMap={nameMap}
					logoIdMap={logoIdMap}
					organisationNameMap={organisationNameMap}
					modelLicenseMap={modelLicenseMap}
					leaderboardTitle={t("toolCallsLeaderboardTitle")}
					leaderboardDescription={t("toolCallsLeaderboardDescription")}
					valueUnit={t("toolCallsUnit")}
				/>
			) : (
				<EmptyChartPreview
				title={t("noPublicToolCallRankings")}
				description={t("toolCallsPopulateDescription")}
					heightClassName="h-[220px]"
				/>
			)}
		</section>
	);
}
