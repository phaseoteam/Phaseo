import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { formatModelDisplayName } from "@/lib/models/displayName";
import { useTranslations } from "next-intl";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rankingToolCallsSectionQuery } from "@/components/(rankings)/rankingSections.queries";

export function ToolCallsSection() {
	const t = useTranslations("Catalogue.rankings");
	const { data: section } = useSuspenseQuery(rankingToolCallsSectionQuery());
	if (!section) return <RankingUnavailable id="tool-calls" title={t("toolCalls")} />;
	const { result, modelIds, metaMap } = section;
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
				leaderboardMetric={"tool_calls"}
					data={result.data}
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
