import Link from "@/components/link";
import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import { formatModelDisplayName } from "@/lib/models/displayName";
import { useTranslations } from "@/i18n/react";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";
import { useSuspenseQuery } from "@tanstack/react-query";
import { rankingImageInputsSectionQuery } from "@/components/(rankings)/rankingSections.queries";

export function ImageInputsSection() {
	const t = useTranslations("Catalogue.rankings");
	const { data: section } = useSuspenseQuery(rankingImageInputsSectionQuery());
	if (!section) return <RankingUnavailable id="image-inputs" title={t("imageInputs")} />;
	const { result, modelIds, metaMap } = section;
	const nameMap = Object.fromEntries(modelIds.map((id) => [id, formatModelDisplayName(metaMap[id]?.name, id)]));
	const logoIdMap = Object.fromEntries(modelIds.map((id) => [id, metaMap[id]?.organisation_id ?? id]));
	const organisationNameMap = Object.fromEntries(modelIds.flatMap((id) => {
		const meta = metaMap[id];
		return [
			[id, meta?.organisation_name ?? meta?.organisation_id ?? null],
			...(meta?.organisation_id ? [[meta.organisation_id, meta.organisation_name ?? meta.organisation_id]] : []),
		];
	}));

	return (
		<section id="image-inputs" className="scroll-mt-32 space-y-4 border-t border-border pt-12">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-0.5">
					<h2 className="text-2xl font-semibold leading-8">{t("imageInputs")}</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{t("imageInputsDescription")}
					</p>
				</div>
				<Link href="/rankings/image" className="text-sm font-medium underline decoration-transparent underline-offset-4 hover:decoration-current">
					{t("viewImageRankings")}
				</Link>
			</div>
			{result.data.length ? (
				<UsageStackedBar
				leaderboardMetric={"image_inputs"}
					data={result.data}
					metric="tokens"
					nameMap={nameMap}
					logoIdMap={logoIdMap}
					organisationNameMap={organisationNameMap}
					leaderboardTitle={t("imageInputLeaderboardTitle")}
					leaderboardDescription={t("imageInputLeaderboardDescription")}
					valueUnit={t("usageImagesUnit")}
				/>
			) : (
				<EmptyChartPreview
					title={t("noPublicImageInputRanking")}
					description={t("imageInputCountsAvailability")}
					heightClassName="h-[220px]"
				/>
			)}
		</section>
	);
}
