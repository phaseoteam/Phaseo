import type { Metadata } from "next";
import ModelsTableDisplay from "@/components/(data)/models/Models/ModelsTableDisplay";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import {
	getRankings,
	type RankingModel,
} from "@/lib/fetchers/rankings/getRankingsData";
import { resolveIncludeHidden } from "@/lib/fetchers/models/visibility";

export const metadata: Metadata = {
	title: "Models table view",
	description:
		"Internal table layout for browsing AI Stats model records in bulk with dense columns, sortable metadata, and quick cross-provider comparisons.",
	robots: {
		index: false,
		follow: true,
	},
};

function normalizeRankingModelKey(value: string): string {
	return String(value ?? "").trim().toLowerCase();
}

function buildWeeklyTokensByModel(
	rankingRows: RankingModel[],
): Record<string, number> {
	const tokensByModel = new Map<string, number>();
	for (const row of rankingRows) {
		const key = normalizeRankingModelKey(row.model_id);
		if (!key || key === "unknown" || key === "other") continue;
		const tokens = Number(row.total_tokens ?? 0);
		if (!Number.isFinite(tokens) || tokens < 0) continue;
		tokensByModel.set(key, (tokensByModel.get(key) ?? 0) + tokens);
	}
	return Object.fromEntries(tokensByModel.entries());
}

export default async function ModelsTablePage() {
	const includeHidden = await resolveIncludeHidden();
	const [monitorResult, rankingsResult] = await Promise.all([
		getMonitorModels({}, includeHidden),
		getRankings("week", "tokens", 4000),
	]);
	const {
		models: modelData,
		allTiers,
		allEndpoints,
		allModalities,
		allFeatures,
		allStatuses,
	} = monitorResult;
	const weeklyTokensByModel = buildWeeklyTokensByModel(rankingsResult.rankings);

	return (
		<ModelsTableDisplay
			initialModelData={modelData}
			allEndpoints={allEndpoints}
			allModalities={allModalities}
			allFeatures={allFeatures}
			allTiers={allTiers}
			allStatuses={allStatuses}
			weeklyTokensByModel={weeklyTokensByModel}
		/>
	);
}

