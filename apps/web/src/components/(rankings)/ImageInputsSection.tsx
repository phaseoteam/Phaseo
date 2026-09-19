import Link from "next/link";
import { EmptyChartPreview } from "@/components/(rankings)/EmptyChartPreview";
import { UsageStackedBar } from "@/components/(rankings)/UsageStackedBar";
import {
	fetchFrontendModelLeaderboardMetaByIds,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { fetchFrontendRankingImageInputs } from "@/lib/fetchers/frontend/fetchRankingSections";
import { formatModelDisplayName } from "@/lib/models/displayName";
import { RankingUnavailable } from "@/components/(rankings)/RankingUnavailable";

export async function ImageInputsSection() {
	const result = await fetchFrontendRankingImageInputs("year", 20).catch(() => null);
	if (!result) return <RankingUnavailable id="image-inputs" title="Image Inputs" />;
	const modelIds = [...new Set(result.data.map((row) => row.model_id).filter(Boolean))];
	const metaMap = await fetchFrontendModelLeaderboardMetaByIds(modelIds).catch(
		(): Awaited<ReturnType<typeof fetchFrontendModelLeaderboardMetaByIds>> => ({}),
	);
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
					<h2 className="text-2xl font-semibold leading-8">Image Inputs</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						Images processed by multimodal models, rather than images generated.
					</p>
				</div>
				<Link href="/rankings/image" className="text-sm font-medium underline decoration-transparent underline-offset-4 hover:decoration-current">
					View Image Rankings
				</Link>
			</div>
			{result.data.length ? (
				<UsageStackedBar
					data={result.data}
					metric="tokens"
					nameMap={nameMap}
					logoIdMap={logoIdMap}
					organisationNameMap={organisationNameMap}
					leaderboardTitle="Image Input Leaderboard"
					leaderboardDescription="Compare models by images processed over the selected period."
					valueUnit="images"
				/>
			) : (
				<EmptyChartPreview
					title="No public image-input ranking yet"
					description="Image-input counts will appear once providers return normalized multimodal usage consistently."
					heightClassName="h-[220px]"
				/>
			)}
		</section>
	);
}
