"use client";

import { useMemo } from "react";
import {
	MonitorDataTable,
	type ModelTablePreferences,
	type ModelData,
} from "@/components/monitor/MonitorDataTable";
import { type MonitorModelTableRow } from "@/lib/fetchers/models/table-view/types";

interface MonitorTableClientProps {
	initialModelData: MonitorModelTableRow[];
	effectiveStatuses?: string[];
	stickyHeaderOffset?: number;
	modelTablePreferences?: ModelTablePreferences;
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
	effectiveStatuses,
	stickyHeaderOffset,
	modelTablePreferences,
}: MonitorTableClientProps) {
	// Convert MonitorModelData to ModelData format for the table
	const modelData = useMemo<ModelData[]>(
		() => initialModelData.map((item) => ({
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
			supportedParameters: item.supportedParameters,
			tier: item.tier,
			added: item.added,
			retired: item.retired,
			popularityTokensWeek: item.popularityTokensWeek ?? 0,
		})),
		[initialModelData],
	);

	return (
		<MonitorDataTable
			data={modelData}
			loading={false}
			effectiveStatuses={effectiveStatuses}
			stickyHeaderOffset={stickyHeaderOffset}
			modelTablePreferences={modelTablePreferences}
		/>
	);
}
