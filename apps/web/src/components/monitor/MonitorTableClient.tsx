"use client";

import {
	MonitorDataTable,
	type ModelData,
} from "@/components/monitor/MonitorDataTable";
import { type MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";

interface MonitorTableClientProps {
	initialModelData: MonitorModelData[];
	weeklyTokensByModel: Record<string, number>;
	weeklyTokensByModelProvider: Record<string, number>;
}

function normalizeModelKey(value: string | null | undefined): string {
	return String(value ?? "").trim().toLowerCase();
}

function buildModelProviderKey(modelKey: string, providerKey: string): string {
	if (!modelKey || !providerKey) return "";
	return `${modelKey}::${providerKey}`;
}

export function MonitorTableClient({
	initialModelData,
	weeklyTokensByModel,
	weeklyTokensByModelProvider,
}: MonitorTableClientProps) {
	// Convert MonitorModelData to ModelData format for the table
	const modelData: ModelData[] = initialModelData.map((item) => {
		const modelKeyCandidates = [
			normalizeModelKey(item.modelId),
			normalizeModelKey(item.apiModelId),
		].filter(Boolean);
		const providerKey = normalizeModelKey(item.provider.id);

		let weeklyTokens: number | null = null;
		for (const candidate of modelKeyCandidates) {
			const providerCompositeKey = buildModelProviderKey(candidate, providerKey);
			if (providerCompositeKey) {
				const providerCandidateValue = Number(
					weeklyTokensByModelProvider[providerCompositeKey] ?? 0,
				);
				if (
					Number.isFinite(providerCandidateValue) &&
					providerCandidateValue >= 0
				) {
					weeklyTokens = providerCandidateValue;
					break;
				}
			}
		}

		if (weeklyTokens == null) {
			let modelFallback = 0;
			for (const candidate of modelKeyCandidates) {
			const modelCandidateValue = Number(weeklyTokensByModel[candidate] ?? 0);
				if (
					Number.isFinite(modelCandidateValue) &&
					modelCandidateValue > modelFallback
				) {
					modelFallback = modelCandidateValue;
				}
			}
			weeklyTokens = modelFallback;
		}

		return {
			id: item.id,
			model: item.model,
			modelId: item.modelId,
			organisationId: item.organisationId,
			provider: item.provider,
			endpoint: item.endpoint,
			gatewayStatus: item.gatewayStatus,
			inputModalities: item.inputModalities,
			outputModalities: item.outputModalities,
			context: item.context,
			maxOutput: item.maxOutput,
			quantization: item.quantization,
			tier: item.tier,
			added: item.added,
			retired: item.retired,
			popularityTokensWeek: weeklyTokens ?? 0,
		};
	});

	return <MonitorDataTable data={modelData} loading={false} />;
}
