import { modelCapabilities, modelCapability } from "@/lib/models/modelCapabilities";

export interface ModelData {
	id: string;
	model: string;
	modelId: string;
	organisationId?: string;
	provider: {
		name: string;
		id: string;
		// Standard per-1M token rates; null when the route lists none.
		inputPrice: number | null;
		outputPrice: number | null;
		// Cheapest non-token charge, such as per image or per second.
		usagePrice?: number;
		usageUnit?: string;
		features: string[];
		executionRegions?: string[] | null;
	};
	endpoint: string;
	gatewayStatus: string;
	inputModalities: string[];
	outputModalities: string[];
	context: number;
	maxOutput: number;
	quantization?: string;
	supportedParameters?: string[];
	tier?: string;
	added?: string;
	retired?: string;
	popularityTokensWeek?: number;
}

export type ModelProvider = ModelData["provider"];

export type ModelUsagePrice = { price: number; unit: string };

export type ModelOperationPrices = {
	capability: string;
	inputPrices: number[];
	outputPrices: number[];
	usagePrices: ModelUsagePrice[];
};

export type ModelStatusEndpoint = {
	status: string;
	endpoints: string[];
};

export interface GroupedModelData {
	id: string;
	model: string;
	modelId: string;
	organisationId?: string;
	providers: ModelProvider[];
	endpoints: string[];
	statusEndpoints: ModelStatusEndpoint[];
	inputModalities: string[];
	outputModalities: string[];
	features: string[];
	executionRegions: string[];
	context: number;
	maxOutput: number;
	supportedParameters: string[];
	tiers: string[];
	inputPrices: number[];
	outputPrices: number[];
	usagePrices: ModelUsagePrice[];
	operationPrices: ModelOperationPrices[];
	added?: string;
	retired?: string;
	popularityTokensWeek: number;
}

function unique(values: Iterable<string>): string[] {
	return Array.from(new Set(values)).filter(Boolean);
}

function isPrice(value: number | null | undefined): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function uniqueNumbers(values: Iterable<number | null | undefined>): number[] {
	return Array.from(new Set(values))
		.filter(isPrice)
		.sort((a, b) => a - b);
}

// A null token price means the route lists none (batch, per-image or per-request
// charges). Such rows must not appear as $0 or become the floor of a price range.
function hasTokenPrice({ provider, tier }: ModelData): boolean {
	return isPrice(provider.inputPrice) || isPrice(provider.outputPrice) || tier === "free";
}

// Units priced in billionths of a dollar read better per million.
const SCALED_USAGE_UNITS: Record<string, string> = {
	pixel: "megapixel",
	character: "1M characters",
};

// The cheapest per-unit charge for each unit, from rows that have no token rate.
function usagePrices(rows: readonly ModelData[]): ModelUsagePrice[] {
	const byUnit = new Map<string, number>();
	for (const { provider } of rows) {
		const rawUnit = provider.usageUnit?.trim();
		if (!rawUnit || !isPrice(provider.usagePrice)) continue;
		const scaledUnit = SCALED_USAGE_UNITS[rawUnit.toLowerCase()];
		const unit = scaledUnit ?? rawUnit;
		const price = scaledUnit ? provider.usagePrice * 1_000_000 : provider.usagePrice;
		byUnit.set(unit, Math.min(byUnit.get(unit) ?? Number.POSITIVE_INFINITY, price));
	}
	return Array.from(byUnit, ([unit, price]) => ({ price, unit }))
		.sort((a, b) => a.price - b.price || a.unit.localeCompare(b.unit));
}

function samePrices(left: ModelOperationPrices, right: ModelOperationPrices): boolean {
	return left.inputPrices.join() === right.inputPrices.join()
		&& left.outputPrices.join() === right.outputPrices.join()
		&& JSON.stringify(left.usagePrices) === JSON.stringify(right.usagePrices);
}

export function groupModelRows(rows: readonly ModelData[]): GroupedModelData[] {
	const groups = new Map<string, ModelData[]>();
	for (const row of rows) {
		const key = row.modelId || row.id;
		const group = groups.get(key);
		if (group) group.push(row);
		else groups.set(key, [row]);
	}

	return Array.from(groups, ([key, variants]) => {
		const first = variants[0];
		const pricedVariants = variants.filter(hasTokenPrice);
		const textVariants = pricedVariants.filter(variant => modelCapability(variant.endpoint) === "text.generate");
		const priceVariants = textVariants.length ? textVariants : pricedVariants;
		const unpricedVariants = variants.filter(variant => !hasTokenPrice(variant));
		// A capability with neither a token rate nor a per-unit charge (a batch row,
		// for example) adds no price line of its own.
		const operationPrices = modelCapabilities(variants.map(({ endpoint }) => endpoint)).map(capability => {
			const matching = pricedVariants.filter(variant => modelCapability(variant.endpoint) === capability);
			return { capability,
				inputPrices: uniqueNumbers(matching.map(variant => variant.provider.inputPrice)),
				outputPrices: uniqueNumbers(matching.map(variant => variant.provider.outputPrice)),
				usagePrices: usagePrices(unpricedVariants.filter(variant => modelCapability(variant.endpoint) === capability)),
			};
		}).filter(operation =>
			operation.inputPrices.length || operation.outputPrices.length || operation.usagePrices.length);
		const operationPricesDiffer = operationPrices.some(operation =>
			!samePrices(operation, operationPrices[0]));
		const providerMap = new Map<string, ModelProvider>();
		for (const variant of variants) {
			const providerKey = variant.provider.id || variant.provider.name;
			const current = providerMap.get(providerKey);
			if (!current) {
				providerMap.set(providerKey, { ...variant.provider });
				continue;
			}
			providerMap.set(providerKey, {
				...current,
				features: unique([...current.features, ...variant.provider.features]),
				executionRegions: unique([
					...(current.executionRegions ?? []),
					...(variant.provider.executionRegions ?? []),
				]),
			});
		}

		const retiredDates = variants.map(({ retired }) => retired).filter(Boolean) as string[];
		return {
			id: key,
			model: first.model,
			modelId: first.modelId,
			organisationId: first.organisationId,
			providers: Array.from(providerMap.values()).sort((a, b) =>
				a.name.localeCompare(b.name),
			),
			endpoints: modelCapabilities(variants.map(({ endpoint }) => endpoint)),
			statusEndpoints: unique(variants.map(({ gatewayStatus }) => gatewayStatus)).map(status => ({
				status,
				endpoints: modelCapabilities(variants
					.filter(({ gatewayStatus }) => gatewayStatus === status)
					.map(({ endpoint }) => endpoint)),
			})),
			inputModalities: unique(
				variants.flatMap(({ inputModalities }) => inputModalities),
			),
			outputModalities: unique(
				variants.flatMap(({ outputModalities }) => outputModalities),
			),
			features: unique(
				variants.flatMap(({ provider }) => provider.features),
			),
			executionRegions: unique(
				variants.flatMap(({ provider }) => provider.executionRegions ?? []),
			),
			context: Math.max(0, ...variants.map(({ context }) => context || 0)),
			maxOutput: Math.max(0, ...variants.map(({ maxOutput }) => maxOutput || 0)),
			supportedParameters: unique(
				variants.flatMap(({ supportedParameters }) => supportedParameters ?? []),
			),
			tiers: unique(variants.map(({ tier }) => tier || "standard")),
			inputPrices: uniqueNumbers(
				priceVariants.map(({ provider }) => provider.inputPrice),
			),
			outputPrices: uniqueNumbers(
				priceVariants.map(({ provider }) => provider.outputPrice),
			),
			usagePrices: usagePrices(unpricedVariants),
			operationPrices: operationPricesDiffer ? operationPrices : [],
			added: variants
				.map(({ added }) => added)
				.filter(Boolean)
				.sort()[0],
			retired:
				retiredDates.length === variants.length
					? retiredDates.sort().at(-1)
					: undefined,
			popularityTokensWeek: Math.max(
				0,
				...variants.map(({ popularityTokensWeek }) => popularityTokensWeek ?? 0),
			),
		};
	});
}
