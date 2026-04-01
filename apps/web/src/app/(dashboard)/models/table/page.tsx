import type { Metadata } from "next";
import ModelsTableDisplay from "@/components/(data)/models/Models/ModelsTableDisplay";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
import {
	getWeeklyModelProviderTokens,
	type WeeklyModelProviderTokens,
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

function buildWeeklyTokensMaps(
	rows: WeeklyModelProviderTokens[],
): {
	weeklyTokensByModel: Record<string, number>;
	weeklyTokensByModelProvider: Record<string, number>;
} {
	const tokensByModel = new Map<string, number>();
	const tokensByModelProvider = new Map<string, number>();

	for (const row of rows) {
		const key = normalizeRankingModelKey(row.model_id);
		if (!key || key === "unknown" || key === "other") continue;
		const providerKey = normalizeRankingModelKey(row.provider);
		const tokens = Number(row.total_tokens ?? 0);
		if (!Number.isFinite(tokens) || tokens < 0) continue;

		tokensByModel.set(key, (tokensByModel.get(key) ?? 0) + tokens);
		if (providerKey) {
			const providerCompositeKey = `${key}::${providerKey}`;
			tokensByModelProvider.set(
				providerCompositeKey,
				(tokensByModelProvider.get(providerCompositeKey) ?? 0) + tokens,
			);
		}
	}

	return {
		weeklyTokensByModel: Object.fromEntries(tokensByModel.entries()),
		weeklyTokensByModelProvider: Object.fromEntries(tokensByModelProvider.entries()),
	};
}

export default async function ModelsTablePage() {
	const includeHidden = await resolveIncludeHidden();
	const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const [monitorResult, weeklyUsageResult] = await Promise.all([
		getMonitorModels({}, includeHidden),
		getWeeklyModelProviderTokens(sinceIso),
	]);
	const {
		models: modelData,
		allTiers,
		allEndpoints,
		allModalities,
		allFeatures,
		allStatuses,
	} = monitorResult;
	const { weeklyTokensByModel, weeklyTokensByModelProvider } =
		buildWeeklyTokensMaps(weeklyUsageResult.data ?? []);

	return (
		<ModelsTableDisplay
			initialModelData={modelData}
			allEndpoints={allEndpoints}
			allModalities={allModalities}
			allFeatures={allFeatures}
			allTiers={allTiers}
			allStatuses={allStatuses}
			weeklyTokensByModel={weeklyTokensByModel}
			weeklyTokensByModelProvider={weeklyTokensByModelProvider}
		/>
	);
}

