"use client";

import {
	MonitorDataTable,
	type ModelData,
} from "@/components/monitor/MonitorDataTable";
import { type MonitorModelTableRow } from "@/lib/fetchers/models/table-view/types";

interface MonitorTableClientProps {
	initialModelData: MonitorModelTableRow[];
}

function formatModelDisplayName(
	modelName: string | null | undefined,
	organisationLabel: string | null | undefined,
): string {
	const model = String(modelName ?? "").trim();
	const organisation = String(organisationLabel ?? "").trim();
	if (!model || !organisation) return model;
	const prefixed = `${organisation}: `;
	if (model.toLowerCase().startsWith(prefixed.toLowerCase())) return model;
	return `${prefixed}${model}`;
}

export function MonitorTableClient({
	initialModelData,
}: MonitorTableClientProps) {
	// Convert MonitorModelData to ModelData format for the table
	const modelData: ModelData[] = initialModelData.map((item) => {
		return {
			id: item.id,
			model: formatModelDisplayName(
				item.model,
				item.organisationName ?? item.organisationId,
			),
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
			popularityTokensWeek: item.popularityTokensWeek ?? 0,
		};
	});

	return <MonitorDataTable data={modelData} loading={false} />;
}
