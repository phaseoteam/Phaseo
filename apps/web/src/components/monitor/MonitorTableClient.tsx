"use client";

import {
	MonitorDataTable,
	type ModelData,
} from "@/components/monitor/MonitorDataTable";
import { type MonitorModelData } from "@/lib/fetchers/models/table-view/getMonitorModels";

interface MonitorTableClientProps {
	initialModelData: MonitorModelData[];
}

export function MonitorTableClient({
	initialModelData,
}: MonitorTableClientProps) {
	// Convert MonitorModelData to ModelData format for the table
	const modelData: ModelData[] = initialModelData.map((item) => ({
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
	}));

	return <MonitorDataTable data={modelData} loading={false} />;
}
