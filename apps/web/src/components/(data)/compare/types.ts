import type { ExtendedModel } from "@/data/types";

export type CompareModelOption = Pick<ExtendedModel, "id" | "name" | "release_date" | "input_types" | "output_types"> & {
	provider: Pick<NonNullable<ExtendedModel["provider"]>, "provider_id" | "name"> | null;
};

export function toCompareModelOption(model: ExtendedModel): CompareModelOption {
	return {
		id: model.id, name: model.name, release_date: model.release_date,
		input_types: model.input_types, output_types: model.output_types,
		provider: model.provider ? { provider_id: model.provider.provider_id, name: model.provider.name } : null,
	};
}

export type CompareGatewayUsagePoint = {
	date: string;
	value: number;
};

export type CompareGatewayUsage = {
	periodDays: number;
	tokens30d: number;
	latestDate: string | null;
	points30d: CompareGatewayUsagePoint[];
	totalRequests: number;
	requests30m: number;
	latencyP50Ms30m: number | null;
	throughputP50TokPerSec30m: number | null;
	cumulativeTokens: number | null;
	requestPoints24h: CompareGatewayUsagePoint[];
};

export type CompareGatewayUsageByModel = Record<string, CompareGatewayUsage>;
