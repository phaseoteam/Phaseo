import type { Metadata } from "next";
import { headers } from "next/headers";
import ModelsTableDisplay from "@/components/(data)/models/Models/ModelsTableDisplay";
import { getMonitorModels } from "@/lib/fetchers/models/table-view/getMonitorModels";
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
	rows: Awaited<ReturnType<typeof getMonitorModels>>["models"],
): {
	weeklyTokensByModel: Record<string, number>;
	weeklyTokensByModelProvider: Record<string, number>;
} {
	const tokensByModel = new Map<string, number>();
	const tokensByModelProvider = new Map<string, number>();

	for (const row of rows) {
		const key = normalizeRankingModelKey(row.modelId);
		if (!key || key === "unknown" || key === "other") continue;
		const providerKey = normalizeRankingModelKey(row.provider.id);
		const modelTokens = Number(row.weeklyTokensModel ?? 0);
		const providerTokens = Number(row.weeklyTokensModelProvider ?? 0);
		if (Number.isFinite(modelTokens) && modelTokens >= 0) {
			const existing = tokensByModel.get(key) ?? 0;
			tokensByModel.set(key, Math.max(existing, modelTokens));
		}

		if (providerKey && Number.isFinite(providerTokens) && providerTokens >= 0) {
			const providerCompositeKey = `${key}::${providerKey}`;
			const existing = tokensByModelProvider.get(providerCompositeKey) ?? 0;
			tokensByModelProvider.set(providerCompositeKey, Math.max(existing, providerTokens));
		}
	}

	return {
		weeklyTokensByModel: Object.fromEntries(tokensByModel.entries()),
		weeklyTokensByModelProvider: Object.fromEntries(tokensByModelProvider.entries()),
	};
}

export default async function ModelsTablePage() {
	// Ensure request-scoped rendering before time-dependent calculations.
	await headers();
	const includeHidden = await resolveIncludeHidden();
	const monitorResult = await getMonitorModels({}, includeHidden);
	const {
		models: modelData,
		allTiers,
		allEndpoints,
		allModalities,
		allFeatures,
		allStatuses,
	} = monitorResult;
	const { weeklyTokensByModel, weeklyTokensByModelProvider } =
		buildWeeklyTokensMaps(modelData);

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

