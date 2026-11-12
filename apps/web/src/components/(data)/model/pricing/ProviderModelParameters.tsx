import type { ProviderModel } from "@/lib/fetchers/models/getModelPricing";
import { extractSupportedParameters } from "@/lib/fetchers/models/table-view/helpers";

export function prettifyParamName(name: string): string {
	return name
		.replace(/[._-]+/g, " ")
		.trim()
		.split(/\s+/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export type ParameterMetadataStatus = "documented" | "partial" | "unknown";

export interface ParameterSupportSummary {
	parameters: string[];
	status: ParameterMetadataStatus;
	documentedRouteCount: number;
	unknownRouteCount: number;
}

export function buildParameterSupportSummary(
	models: ProviderModel[],
): ParameterSupportSummary {
	const parameters = new Set<string>();
	let documentedRouteCount = 0;
	let unknownRouteCount = 0;

	for (const model of models) {
		const routeParameters = extractSupportedParameters(model.params);
		if (routeParameters.length === 0) {
			unknownRouteCount += 1;
			continue;
		}

		documentedRouteCount += 1;
		for (const param of routeParameters) parameters.add(param);
	}

	const sortedParameters = Array.from(parameters).sort((a, b) =>
		a.localeCompare(b),
	);
	const status: ParameterMetadataStatus =
		sortedParameters.length === 0
			? "unknown"
			: unknownRouteCount > 0
				? "partial"
				: "documented";

	return {
		parameters: sortedParameters,
		status,
		documentedRouteCount,
		unknownRouteCount,
	};
}
