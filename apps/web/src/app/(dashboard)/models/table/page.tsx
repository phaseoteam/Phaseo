import type { Metadata } from "next";
import { headers } from "next/headers";
import ModelsTableDisplay from "@/components/(data)/models/Models/ModelsTableDisplay";
import { fetchFrontendMonitorModels } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { MonitorModelTableRow } from "@/lib/fetchers/models/table-view/types";

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
	rows: Awaited<ReturnType<typeof fetchFrontendMonitorModels>>["models"],
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

function toCompactTableRows(
	rows: Awaited<ReturnType<typeof fetchFrontendMonitorModels>>["models"],
	weeklyTokensByModel: Record<string, number>,
	weeklyTokensByModelProvider: Record<string, number>,
): MonitorModelTableRow[] {
	return rows.map((row) => {
		const modelKeys = [row.modelId, row.apiModelId]
			.map((value) => normalizeRankingModelKey(String(value ?? "")))
			.filter(Boolean);
		const providerKey = normalizeRankingModelKey(row.provider.id);
		let weeklyTokens = 0;

		for (const modelKey of modelKeys) {
			const providerCompositeKey = providerKey
				? `${modelKey}::${providerKey}`
				: "";
			const providerValue = Number(
				weeklyTokensByModelProvider[providerCompositeKey] ?? Number.NaN,
			);
			if (Number.isFinite(providerValue) && providerValue >= 0) {
				weeklyTokens = providerValue;
				break;
			}

			const modelValue = Number(weeklyTokensByModel[modelKey] ?? 0);
			if (Number.isFinite(modelValue) && modelValue > weeklyTokens) {
				weeklyTokens = modelValue;
			}
		}

		return {
			id: row.id,
			model: row.model,
			modelId: row.modelId,
			organisationId: row.organisationId,
			organisationName: row.organisationName,
			provider: {
				name: row.provider.name,
				id: row.provider.id,
				inputPrice: row.provider.inputPrice,
				outputPrice: row.provider.outputPrice,
				features: row.provider.features,
			},
			endpoint: row.endpoint,
			gatewayStatus: row.gatewayStatus,
			inputModalities: row.inputModalities,
			outputModalities: row.outputModalities,
			context: row.context,
			maxOutput: row.maxOutput,
			quantization: row.quantization,
			tier: row.tier,
			added: row.added,
			retired: row.retired,
			popularityTokensWeek: weeklyTokens,
		};
	});
}

export default async function ModelsTablePage() {
	// Ensure request-scoped rendering before time-dependent calculations.
	await headers();
	const monitorResult = await fetchFrontendMonitorModels();
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
	const compactModelData = toCompactTableRows(
		modelData,
		weeklyTokensByModel,
		weeklyTokensByModelProvider,
	);

	return (
		<ModelsTableDisplay
			initialModelData={compactModelData}
			allEndpoints={allEndpoints}
			allModalities={allModalities}
			allFeatures={allFeatures}
			allTiers={allTiers}
			allStatuses={allStatuses}
		/>
	);
}

