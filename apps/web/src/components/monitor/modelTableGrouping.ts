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

export interface GroupedModelData {
	id: string;
	model: string;
	modelId: string;
	organisationId?: string;
	providers: ModelProvider[];
	endpoints: string[];
	gatewayStatuses: string[];
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
			endpoints: unique(variants.map(({ endpoint }) => endpoint)),
			gatewayStatuses: unique(
				variants.map(({ gatewayStatus }) => gatewayStatus),
			),
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
				variants.map(({ provider }) => provider.inputPrice),
			),
			outputPrices: uniqueNumbers(
				variants.map(({ provider }) => provider.outputPrice),
			),
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
