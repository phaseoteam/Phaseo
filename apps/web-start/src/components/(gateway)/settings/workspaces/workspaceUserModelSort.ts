import { getModelDisplayName, type ModelMetadataMap } from "../../usage/model-display";
import type { TableSort } from "../../usage/SortableTableHead";

export type WorkspaceUserModelSortKey = "model" | "requests" | "spendUsd";
type ModelUsage = { modelId: string; requests: number; spendUsd: number };

export function sortWorkspaceUserModels(rows: ModelUsage[], metadata: ModelMetadataMap, sort: TableSort<WorkspaceUserModelSortKey>, locale: string) {
	if (!sort) return rows;
	return [...rows].sort((a, b) => {
		const result = sort.key === "model"
			? getModelDisplayName(a.modelId, metadata).localeCompare(getModelDisplayName(b.modelId, metadata), locale, { numeric: true })
			: a[sort.key] - b[sort.key];
		return sort.direction === "asc" ? result : -result;
	});
}
