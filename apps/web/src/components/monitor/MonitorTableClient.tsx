"use client";

import {
	MonitorDataTable,
	type ModelData,
} from "@/components/monitor/MonitorDataTable";
import { type MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";

interface MonitorTableClientProps {
	initialModelData: MonitorModelData[];
	weeklyTokensByModel: Record<string, number>;
}

function normalizeModelKey(value: string | null | undefined): string {
	return String(value ?? "").trim().toLowerCase();
}

export function MonitorTableClient({
	initialModelData,
	weeklyTokensByModel,
}: MonitorTableClientProps) {
	// Convert MonitorModelData to ModelData format for the table
	const modelData: ModelData[] = initialModelData.map((item) => {
		const modelKeyCandidates = [
			normalizeModelKey(item.modelId),
			normalizeModelKey(item.apiModelId),
		].filter(Boolean);

		let weeklyTokens = 0;
		for (const candidate of modelKeyCandidates) {
			const candidateValue = Number(weeklyTokensByModel[candidate] ?? 0);
			if (Number.isFinite(candidateValue) && candidateValue > weeklyTokens) {
				weeklyTokens = candidateValue;
			}
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
			popularityTokensWeek: weeklyTokens,
		};
	});

	return <MonitorDataTable data={modelData} loading={false} />;
}
