import { modelCapabilities, modelCapability } from "@/lib/models/modelCapabilities";

export interface ModelData {
	id: string;
	model: string;
	modelId: string;
	organisationId?: string;
	provider: {
		name: string;
		id: string;
		inputPrice: number;
		outputPrice: number;
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
	operationPrices: Array<{ capability: string; inputPrices: number[]; outputPrices: number[] }>;
	added?: string;
	retired?: string;
	popularityTokensWeek: number;
}

function unique(values: Iterable<string>): string[] {
	return Array.from(new Set(values)).filter(Boolean);
}

function uniqueNumbers(values: Iterable<number>): number[] {
	return Array.from(new Set(values))
		.filter((value) => Number.isFinite(value) && value >= 0)
		.sort((a, b) => a - b);
}

// The table projection reports 0/0 when a row has no token rate (batch, per-image or
// per-request charges). Those rows must not become the floor of a token price range.
function hasTokenPrice({ provider, tier }: ModelData): boolean {
	return provider.inputPrice > 0 || provider.outputPrice > 0 || tier === "free";
}

function samePrices(left: number[], right: number[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
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
		const pricedVariants = variants.some(hasTokenPrice) ? variants.filter(hasTokenPrice) : variants;
		const textVariants = pricedVariants.filter(variant => modelCapability(variant.endpoint) === "text.generate");
		const priceVariants = textVariants.length ? textVariants : pricedVariants;
		const operationPrices = modelCapabilities(pricedVariants.map(({ endpoint }) => endpoint)).map(capability => {
			const matching = pricedVariants.filter(variant => modelCapability(variant.endpoint) === capability);
			return { capability,
				inputPrices: uniqueNumbers(matching.map(variant => variant.provider.inputPrice)),
				outputPrices: uniqueNumbers(matching.map(variant => variant.provider.outputPrice)),
			};
		});
		const operationPricesDiffer = operationPrices.some(operation =>
			!samePrices(operation.inputPrices, operationPrices[0].inputPrices)
			|| !samePrices(operation.outputPrices, operationPrices[0].outputPrices));
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
