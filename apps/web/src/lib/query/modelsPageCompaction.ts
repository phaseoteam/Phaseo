import type {
	ModelsPageData,
	ModelsPageModel,
} from "@/components/(data)/models/Models/modelsDisplay.types";

// The models page streams the whole catalogue (about 1,700 models) into its
// HTML. Most fields are empty, and several repeat data held elsewhere on the
// same model. The cached query keeps a compact form; the page client expands
// it back through the query's `select`, so components see the original shape.
//
// A value is only omitted when expanding reproduces it exactly, which keeps the
// round trip lossless even when the API returns something unexpected.

type UnknownRecord = Record<string, unknown>;

type FieldRule = {
	key: string;
	fallback: (record: UnknownRecord) => unknown;
};

/** Keys that were missing from the source record, so expansion must not add them. */
const ABSENT_KEYS = "__absent";

export type CompactModelsPageModel = Pick<ModelsPageModel, "model_id"> & UnknownRecord;

export type CompactModelsPageData = Omit<ModelsPageData, "models"> & {
	models: CompactModelsPageModel[];
	/** Shared absence lists; models refer to them by index. */
	absentKeySets?: string[][];
};

const nullFields = (keys: string[]): FieldRule[] =>
	keys.map((key) => ({ key, fallback: () => null }));

const emptyListFields = (keys: string[]): FieldRule[] =>
	keys.map((key) => ({ key, fallback: () => [] }));

function asRecords(value: unknown): UnknownRecord[] {
	return Array.isArray(value)
		? value.filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object")
		: [];
}

function uniqueStrings(values: unknown[]): string[] {
	return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

function primaryTimestamp(record: UnknownRecord): number | null {
	if (typeof record.primary_date !== "string") return null;
	const timestamp = Date.parse(record.primary_date);
	return Number.isFinite(timestamp) ? timestamp : null;
}

function primaryGroupKey(record: UnknownRecord): string | null {
	const timestamp = primaryTimestamp(record);
	if (timestamp === null) return null;
	// UTC keeps the derivation identical on the server and in every browser.
	const date = new Date(timestamp);
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

const providerDetailRules: FieldRule[] = [
	...nullFields(["status", "data_region", "execution_region", "provider_model_slug"]),
	{ key: "service_tier", fallback: () => "standard" },
];

// Defaults come first: derived values read the fields restored before them.
// Fields the catalogue API usually leaves out (such as organisation colours)
// have no rule, because each model would then carry an absence marker.
const modelRules: FieldRule[] = [
	...nullFields([
		"description", "status",
		"deprecation_date", "retirement_date", "removal_date", "primary_date",
		"lowest_input_price", "lowest_output_price",
		"lowest_standard_input_price", "lowest_standard_output_price",
		"lowest_standard_input_price_label", "lowest_standard_input_price_unit",
		"lowest_standard_output_price_label", "lowest_standard_output_price_unit",
		"lowest_from_price", "lowest_from_price_unit",
		"popularity_tokens_week", "weekly_usage_metric", "weekly_usage_quantity",
		"weekly_usage_unit", "throughput_week", "latency_week",
	]),
	...emptyListFields([
		"gateway_endpoints", "gateway_input_modalities", "gateway_output_modalities",
		"gateway_features", "gateway_tiers", "gateway_execution_regions",
		"gateway_provider_details", "context_lengths", "supported_parameters",
		"pricing_detail_rows", "gateway_monitor_rows",
	]),
	{ key: "primary_timestamp", fallback: primaryTimestamp },
	{ key: "primary_group_key", fallback: primaryGroupKey },
	{ key: "base_model_id", fallback: (model) => model.model_id },
	{ key: "variant_kind", fallback: () => "standard" },
	{
		key: "variants",
		fallback: (model) => ({ standard: { model_id: model.model_id, name: model.name } }),
	},
	{
		key: "gateway_provider_count",
		fallback: (model) => asRecords(model.gateway_provider_details).length,
	},
	{
		key: "gateway_active_provider_count",
		fallback: (model) => asRecords(model.gateway_provider_details).filter((provider) => provider.is_active === true).length,
	},
	{
		key: "gateway_provider_names",
		fallback: (model) => uniqueStrings(asRecords(model.gateway_provider_details).map((provider) => provider.name)),
	},
	{
		key: "gateway_active_provider_names",
		fallback: (model) => uniqueStrings(
			asRecords(model.gateway_provider_details)
				.filter((provider) => provider.is_active === true)
				.map((provider) => provider.name),
		),
	},
	{
		key: "gateway_api_model_ids",
		fallback: (model) => uniqueStrings(asRecords(model.gateway_provider_details).map((provider) => provider.provider_model_slug)),
	},
];

function isDeepEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) || Array.isArray(right)) {
		return Array.isArray(left) && Array.isArray(right) &&
			left.length === right.length &&
			left.every((value, index) => isDeepEqual(value, right[index]));
	}
	if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
	const leftEntries = Object.entries(left).filter(([, value]) => value !== undefined);
	const rightRecord = right as UnknownRecord;
	return leftEntries.length === Object.values(right).filter((value) => value !== undefined).length &&
		leftEntries.every(([key, value]) => isDeepEqual(value, rightRecord[key]));
}

function compactRecord(source: UnknownRecord, rules: FieldRule[]): UnknownRecord {
	const compact: UnknownRecord = {};
	for (const [key, value] of Object.entries(source)) {
		if (value !== undefined) compact[key] = value;
	}
	const absent: string[] = [];
	for (const rule of rules) {
		if (source[rule.key] === undefined) absent.push(rule.key);
		else if (isDeepEqual(source[rule.key], rule.fallback(source))) delete compact[rule.key];
	}
	if (absent.length > 0) compact[ABSENT_KEYS] = absent;
	return compact;
}

function expandRecord(compact: UnknownRecord, rules: FieldRule[]): UnknownRecord {
	const { [ABSENT_KEYS]: absentKeys, ...expanded } = compact;
	const absent = new Set(Array.isArray(absentKeys) ? absentKeys : []);
	for (const rule of rules) {
		if (!absent.has(rule.key) && !(rule.key in expanded)) {
			expanded[rule.key] = rule.fallback(expanded);
		}
	}
	return expanded;
}

export function compactModelsPageModel(model: ModelsPageModel): CompactModelsPageModel {
	const source = model as unknown as UnknownRecord;
	const details = model.gateway_provider_details?.map((provider) =>
		compactRecord(provider as unknown as UnknownRecord, providerDetailRules));
	const compact = compactRecord(source, modelRules);
	if (details && "gateway_provider_details" in compact) compact.gateway_provider_details = details;
	return compact as CompactModelsPageModel;
}

export function expandModelsPageModel(compact: CompactModelsPageModel): ModelsPageModel {
	const withDetails: UnknownRecord = Array.isArray(compact.gateway_provider_details)
		? {
			...compact,
			gateway_provider_details: asRecords(compact.gateway_provider_details)
				.map((provider) => expandRecord(provider, providerDetailRules)),
		}
		: compact;
	return expandRecord(withDetails, modelRules) as unknown as ModelsPageModel;
}

export function compactModelsPageData(data: ModelsPageData): CompactModelsPageData {
	// Catalogue-only models (no gateway route) all omit the same fields, so the
	// absence lists are stored once rather than on every model.
	const absentKeySets: string[][] = [];
	const indexBySignature = new Map<string, number>();
	const models = data.models.map((model) => {
		const compact = compactModelsPageModel(model);
		const absent = compact[ABSENT_KEYS];
		if (!Array.isArray(absent)) return compact;
		const signature = absent.join(",");
		let index = indexBySignature.get(signature);
		if (index === undefined) {
			index = absentKeySets.push(absent as string[]) - 1;
			indexBySignature.set(signature, index);
		}
		return { ...compact, [ABSENT_KEYS]: index };
	});
	return absentKeySets.length > 0 ? { ...data, models, absentKeySets } : { ...data, models };
}

export function expandModelsPageData(data: CompactModelsPageData): ModelsPageData {
	const { absentKeySets = [], ...rest } = data;
	return {
		...rest,
		models: data.models.map((model) => {
			const absent = model[ABSENT_KEYS];
			return expandModelsPageModel(typeof absent === "number"
				? { ...model, [ABSENT_KEYS]: absentKeySets[absent] ?? [] }
				: model);
		}),
	};
}
