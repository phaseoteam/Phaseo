import { modelOutputFilterValues } from "@/lib/models/modelCapabilities";
import { modelRowKey, type ModelData } from "./modelTableGrouping";

export type ModelTableFilters = {
	search: string;
	year: number;
	inputModalities: string[];
	outputModalities: string[];
	features: string[];
	tiers: string[];
	supportedParameters: string[];
	providers: string[];
	regions: string[];
	creators: string[];
	contextMin: number;
	endpoints: string[];
	statuses: string[];
};

export type ModelTableFilterDimension = Exclude<keyof ModelTableFilters, "search">;

export const NO_MODEL_TABLE_FILTERS: ModelTableFilters = {
	search: "",
	year: 0,
	inputModalities: [],
	outputModalities: [],
	features: [],
	tiers: [],
	supportedParameters: [],
	providers: [],
	regions: [],
	creators: [],
	contextMin: 0,
	endpoints: [],
	statuses: [],
};

export function normalizeModelTableStatus(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, "_");
	if (!normalized) return "";
	if (normalized === "not_active") return "inactive";
	if (normalized === "deranked" || normalized === "de_ranked") {
		return "deranked_lvl1";
	}
	if (normalized === "deranked_lvl_1") return "deranked_lvl1";
	if (normalized === "deranked_lvl_2") return "deranked_lvl2";
	if (normalized === "deranked_lvl_3") return "deranked_lvl3";
	return normalized;
}

function matchesSearch(row: ModelData, search: string): boolean {
	const searchLower = search.toLowerCase();
	const includes = (value: unknown) => String(value).toLowerCase().includes(searchLower);
	return Object.values(row).some((value) => {
		if (Array.isArray(value)) return value.some(includes);
		if (typeof value === "object" && value !== null) {
			return Object.values(value).some((nestedValue) =>
				Array.isArray(nestedValue) ? nestedValue.some(includes) : includes(nestedValue));
		}
		return includes(value);
	});
}

function rowTier(row: ModelData): string {
	return String(row.tier ?? "standard").trim().toLowerCase();
}

function rowRegions(row: ModelData): string[] {
	return (row.provider.executionRegions ?? []).map((value) => String(value).trim().toLowerCase());
}

export function filterModelTableRowsBySearch<Row extends ModelData>(rows: readonly Row[], search: string): Row[] {
	return search ? rows.filter((row) => matchesSearch(row, search)) : [...rows];
}

// Filters apply per provider route, so a model matches when one of its routes
// satisfies every selected filter.
export function matchesModelTableRow(
	row: ModelData,
	filters: ModelTableFilters,
	exclude?: ModelTableFilterDimension,
): boolean {
	const active = (dimension: ModelTableFilterDimension) => dimension !== exclude;
	if (filters.search && !matchesSearch(row, filters.search)) return false;
	if (active("year") && filters.year > 0) {
		const itemYear = row.added ? new Date(row.added).getFullYear() : null;
		if (itemYear !== filters.year) return false;
	}
	if (active("inputModalities") && !filters.inputModalities.every((mod) => row.inputModalities.includes(mod))) {
		return false;
	}
	if (active("outputModalities") && filters.outputModalities.length > 0) {
		const outputs = modelOutputFilterValues(row.outputModalities, [row.endpoint]);
		if (!filters.outputModalities.every((mod) => outputs.includes(mod))) return false;
	}
	if (active("features") && !filters.features.every((feature) => row.provider.features.includes(feature))) {
		return false;
	}
	if (active("tiers") && filters.tiers.length > 0 && !filters.tiers.includes(rowTier(row))) return false;
	if (active("supportedParameters") && filters.supportedParameters.length > 0) {
		const parameters = new Set(row.supportedParameters ?? []);
		if (!filters.supportedParameters.every((value) => parameters.has(value))) return false;
	}
	if (active("providers") && filters.providers.length > 0 && !filters.providers.includes(row.provider.id)) {
		return false;
	}
	if (active("regions") && filters.regions.length > 0) {
		const regions = new Set(rowRegions(row));
		if (!filters.regions.every((value) => regions.has(value))) return false;
	}
	if (
		active("creators") &&
		filters.creators.length > 0 &&
		(!row.organisationId || !filters.creators.includes(row.organisationId))
	) {
		return false;
	}
	if (active("contextMin") && filters.contextMin > 0 && row.context < filters.contextMin) return false;
	if (active("endpoints") && filters.endpoints.length > 0 && !filters.endpoints.includes(row.endpoint)) {
		return false;
	}
	if (
		active("statuses") &&
		filters.statuses.length > 0 &&
		!filters.statuses.includes(normalizeModelTableStatus(row.gatewayStatus))
	) {
		return false;
	}
	return true;
}

// The values a row contributes to a filter dimension's options.
export function modelTableFilterValues(row: ModelData, dimension: ModelTableFilterDimension): string[] {
	switch (dimension) {
		case "year": {
			const year = row.added ? new Date(row.added).getFullYear() : Number.NaN;
			return Number.isNaN(year) ? [] : [String(year)];
		}
		case "inputModalities":
			return row.inputModalities;
		case "outputModalities":
			return modelOutputFilterValues(row.outputModalities, [row.endpoint]);
		case "features":
			return row.provider.features;
		case "tiers":
			return [rowTier(row)];
		case "supportedParameters":
			return row.supportedParameters ?? [];
		case "providers":
			return [row.provider.id];
		case "regions":
			return rowRegions(row);
		case "creators":
			return row.organisationId ? [row.organisationId] : [];
		case "contextMin":
			return [];
		case "endpoints":
			return [row.endpoint];
		case "statuses":
			return [normalizeModelTableStatus(row.gatewayStatus)];
	}
}

// Counts distinct models (not provider routes) for each value of a dimension,
// among routes that match every other active filter. Selecting a value then
// shows exactly that many table rows.
export function countModelsByFilterValue(
	rows: readonly ModelData[],
	filters: ModelTableFilters,
	dimension: ModelTableFilterDimension,
	normalize: (value: string) => string = (value) => String(value ?? "").trim(),
): Map<string, number> {
	const modelsByValue = new Map<string, Set<string>>();
	for (const row of rows) {
		if (!matchesModelTableRow(row, filters, dimension)) continue;
		const modelKey = modelRowKey(row);
		for (const raw of modelTableFilterValues(row, dimension)) {
			const value = normalize(raw);
			if (!value) continue;
			const models = modelsByValue.get(value);
			if (models) models.add(modelKey);
			else modelsByValue.set(value, new Set([modelKey]));
		}
	}
	return new Map(Array.from(modelsByValue, ([value, models]) => [value, models.size]));
}
