import { createAdminClient } from "@/utils/supabase/admin";
import { cacheLife, cacheTag } from "next/cache";
import { featureOrder } from "@/lib/config/featureLabels";
import type {
	GatewayProvider,
	MonitorModelData,
	MonitorModelFilters,
} from "@/lib/fetchers/models/table-view/types";
import {
	parseModalities,
	extractFeatureKeys,
	extractSupportedParameters,
	normalizeGatewayModel,
	normalizeCapabilityStatus,
	normalizeEndpoint,
	resolveGatewayStatus,
} from "./helpers";

export type { MonitorModelData } from "./types";

function toNullableNumber(value: unknown): number | null {
	if (value === null || value === undefined) return null;
	const numericValue = Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

type MonitorModelRpcRow = {
	model_id: string | null;
	model_name: string | null;
	model_release_date: string | null;
	model_retirement_date: string | null;
	model_status: string | null;
	model_input_types: unknown;
	model_output_types: unknown;
	organisation_id: string | null;
	organisation_name: string | null;
	hidden: boolean | null;
	provider_api_model_id: string | null;
	provider_id: string | null;
	api_model_id: string | null;
	provider_model_slug: string | null;
	is_active_gateway: boolean | null;
	input_modalities: unknown;
	output_modalities: unknown;
	quantization_scheme: string | null;
	context_length: number | null;
	provider_max_output_tokens: number | null;
	effective_from: string | null;
	effective_to: string | null;
	capability_id: string | null;
	capability_params: unknown;
	capability_status: string | null;
	capability_max_input_tokens: number | null;
	capability_max_output_tokens: number | null;
	api_provider_name: string | null;
	provider_link: string | null;
	input_price: number | null;
	output_price: number | null;
	standard_input_price: number | null;
	standard_output_price: number | null;
	standard_input_price_label: string | null;
	standard_input_price_unit: string | null;
	standard_output_price_label: string | null;
	standard_output_price_unit: string | null;
	from_price: number | null;
	from_price_unit: string | null;
	pricing_tier: string | null;
	is_free_variant: boolean | null;
	weekly_tokens_model: number | null;
	weekly_tokens_model_provider: number | null;
	weekly_throughput_model: number | null;
	weekly_latency_model: number | null;
};

const MONITOR_RPC_PAGE_SIZE = 1000;
const PRICING_RULE_PAGE_SIZE = 1000;

type PricingRuleSupplementRow = {
	model_key: string | null;
	pricing_plan: string | null;
	meter: string | null;
	note: string | null;
	unit: string | null;
	unit_size: number | null;
	price_per_unit: number | null;
	effective_from: string | null;
	effective_to: string | null;
	match: unknown;
};

type PricingSupplement = {
	standardInputPrice: number | null;
	standardOutputPrice: number | null;
	standardInputPriceLabel: string | null;
	standardInputPriceUnit: string | null;
	standardOutputPriceLabel: string | null;
	standardOutputPriceUnit: string | null;
	fromPrice: number | null;
	fromPriceUnit: string | null;
	pricingDetailRows: Array<{
		label: string;
		value: string;
	}>;
};

async function fetchAllMonitorModelRows(
	includeHidden: boolean,
): Promise<MonitorModelRpcRow[]> {
	const supabase = createAdminClient();
	const rows: MonitorModelRpcRow[] = [];

	for (let from = 0; ; from += MONITOR_RPC_PAGE_SIZE) {
		const to = from + MONITOR_RPC_PAGE_SIZE - 1;
		const { data, error } = await supabase
			.rpc("get_monitor_model_rows", {
				p_include_hidden: includeHidden,
			})
			.range(from, to);

		if (error) {
			throw error;
		}

		const page = (data ?? []) as MonitorModelRpcRow[];
		rows.push(...page);

		if (page.length < MONITOR_RPC_PAGE_SIZE) {
			break;
		}
	}

	return rows;
}

function isRuleActive(
	effectiveFrom: string | null | undefined,
	effectiveTo: string | null | undefined,
	nowMs: number,
): boolean {
	const fromMs = effectiveFrom ? new Date(effectiveFrom).getTime() : null;
	const toMs = effectiveTo ? new Date(effectiveTo).getTime() : null;
	if (fromMs !== null && Number.isFinite(fromMs) && fromMs > nowMs) return false;
	if (toMs !== null && Number.isFinite(toMs) && nowMs >= toMs) return false;
	return true;
}

function normalizeDisplayUnit(unit: string | null | undefined): string | null {
	const normalized = String(unit ?? "")
		.trim()
		.toLowerCase();
	if (!normalized) return null;
	if (["token", "tokens"].includes(normalized)) return "1M tokens";
	if (["minute", "minutes", "min", "mins", "m"].includes(normalized)) return "second";
	if (["hour", "hours", "hr", "hrs", "h"].includes(normalized)) return "second";
	if (["second", "seconds", "sec", "secs", "s"].includes(normalized)) return "second";
	if (["image", "images"].includes(normalized)) return "image";
	if (["video", "videos"].includes(normalized)) return "video";
	if (["character", "characters", "char", "chars"].includes(normalized)) {
		return "character";
	}
	return normalized;
}

function parseMinutePricingNote(
	note: string | null | undefined,
): { price: number; unit: "minute" } | null {
	const normalized = String(note ?? "").trim();
	if (!normalized) return null;
	const match = normalized.match(/\$([\d.]+)\s*\/\s*minute/i);
	if (!match) return null;
	const price = Number(match[1]);
	if (!Number.isFinite(price) || price < 0) return null;
	return { price, unit: "minute" };
}

function getStandardSideAndLabel(
	meter: string | null | undefined,
): { side: "input" | "output" | null; label: string | null } {
	const normalized = String(meter ?? "")
		.trim()
		.toLowerCase();
	if (["input_text_tokens", "input_tokens"].includes(normalized)) {
		return { side: "input", label: "Text Input" };
	}
	if (["output_text_tokens", "output_tokens"].includes(normalized)) {
		return { side: "output", label: "Text Output" };
	}
	if (["input_audio_tokens", "input_audio"].includes(normalized)) {
		return { side: "input", label: "Audio Input" };
	}
	if (["output_audio_tokens", "output_audio", "output_audio_seconds"].includes(normalized)) {
		return { side: "output", label: "Audio Output" };
	}
	if (["input_image_tokens", "input_image"].includes(normalized)) {
		return { side: "input", label: "Image Input" };
	}
	if (["output_image_tokens", "output_image"].includes(normalized)) {
		return { side: "output", label: "Image Output" };
	}
	if (["input_video_tokens", "input_video"].includes(normalized)) {
		return { side: "input", label: "Video Input" };
	}
	if (["output_video_tokens", "output_video", "output_video_seconds"].includes(normalized)) {
		return { side: "output", label: "Video Output" };
	}
	return { side: null, label: null };
}

function computeDisplayPrice(rule: PricingRuleSupplementRow): number | null {
	const minutePricing = parseMinutePricingNote(rule.note);
	if (minutePricing) return minutePricing.price;
	const unitSize = Number(rule.unit_size ?? 0);
	const pricePerUnit = Number(rule.price_per_unit ?? Number.NaN);
	if (!Number.isFinite(pricePerUnit) || !Number.isFinite(unitSize) || unitSize <= 0) {
		return null;
	}
	const meter = String(rule.meter ?? "")
		.trim()
		.toLowerCase();
	const unit = String(rule.unit ?? "")
		.trim()
		.toLowerCase();
	if (meter.includes("token") || ["token", "tokens"].includes(unit)) {
		return pricePerUnit * (1_000_000 / unitSize);
	}
	if (["minute", "minutes", "min", "mins", "m"].includes(unit)) {
		return pricePerUnit / unitSize / 60;
	}
	if (["hour", "hours", "hr", "hrs", "h"].includes(unit)) {
		return pricePerUnit / unitSize / 3600;
	}
	return pricePerUnit / unitSize;
}

function formatPriceAmount(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "$0";
	if (value === 0) return "$0";
	if (value < 0.001) return `$${value.toFixed(4)}`;
	if (value < 0.1) return `$${value.toFixed(3)}`;
	if (value < 1) return `$${value.toFixed(2)}`;
	return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatDetailValue(price: number, unit: string): string {
	const amount = formatPriceAmount(price);
	if (unit === "1M tokens") return `${amount} /M tokens`;
	return `${amount} / ${unit}`;
}

function formatDetailValueRange(prices: number[], unit: string): string {
	const sorted = [...prices]
		.filter((value) => Number.isFinite(value))
		.sort((a, b) => a - b);
	if (sorted.length === 0) return formatDetailValue(0, unit);
	const min = sorted[0]!;
	const max = sorted[sorted.length - 1]!;
	if (min === max) return formatDetailValue(min, unit);
	const minText = formatPriceAmount(min);
	const maxText = formatPriceAmount(max);
	if (unit === "1M tokens") return `${minText}-${maxText} /M tokens`;
	return `${minText}-${maxText} / ${unit}`;
}

function normalizeComparableUnit(value: string | null | undefined): string | null {
	const normalized = String(value ?? "").trim().toLowerCase();
	if (!normalized) return null;
	if (["minute", "minutes", "min", "mins", "m"].includes(normalized)) {
		return normalized;
	}
	return normalizeDisplayUnit(normalized) ?? normalized;
}

function shouldPreferSupplementStandardPrice(
	rowUnit: string | null | undefined,
	supplementUnit: string | null | undefined,
): boolean {
	const normalizedRowUnit = normalizeComparableUnit(rowUnit);
	const normalizedSupplementUnit = normalizeComparableUnit(supplementUnit);
	if (!normalizedSupplementUnit) return false;
	if (!normalizedRowUnit) return true;
	return normalizedRowUnit !== normalizedSupplementUnit;
}

function toTitleCase(value: string): string {
	return value.replace(/\b([a-z])([a-z]*)/gi, (_, first: string, rest: string) => {
		return `${first.toUpperCase()}${rest.toLowerCase()}`;
	});
}

function formatMatchValue(value: unknown): string | null {
	if (Array.isArray(value)) {
		const parts = value
			.map((entry) => formatMatchValue(entry))
			.filter((entry): entry is string => Boolean(entry));
		return parts.length > 0 ? parts.join("/") : null;
	}
	if (typeof value === "boolean") return value ? "with audio" : "no audio";
	if (typeof value === "number") return Number.isFinite(value) ? `${value}s` : null;
	if (typeof value === "string") {
		const normalized = value.trim();
		return normalized.length > 0 ? normalized : null;
	}
	return null;
}

function formatThresholdTokenCount(value: unknown): string | null {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return null;
	if (numeric >= 1_000_000) {
		const scaled = numeric / 1_000_000;
		return `${scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1)}M`;
	}
	if (numeric >= 1_000) {
		const scaled = numeric / 1_000;
		return `${scaled % 1 === 0 ? scaled.toFixed(0) : scaled.toFixed(1)}K`;
	}
	return `${numeric}`;
}

function getInputTokenTierLabel(match: unknown): string | null {
	if (!Array.isArray(match)) return null;
	const inputTokenRule = match.find(
		(entry) =>
			entry &&
			typeof entry === "object" &&
			"path" in entry &&
			(entry as { path?: unknown }).path === "input_tokens" &&
			"op" in entry &&
			"value" in entry,
	) as { op?: unknown; value?: unknown } | undefined;
	if (!inputTokenRule) return null;
	const threshold = formatThresholdTokenCount(inputTokenRule.value);
	if (!threshold) return null;
	const op = String(inputTokenRule.op ?? "").trim().toLowerCase();
	if (op === "lte" || op === "lt") return `Up to ${threshold} context`;
	if (op === "gte" || op === "gt") return `Over ${threshold} context`;
	if (op === "eq") return `${threshold} context`;
	return null;
}

function findMatchValue(match: unknown, path: string): string | null {
	if (!Array.isArray(match)) return null;
	const entry = match.find(
		(candidate) =>
			candidate &&
			typeof candidate === "object" &&
			"path" in candidate &&
			(candidate as { path?: unknown }).path === path &&
			"value" in candidate,
	) as { value?: unknown } | undefined;
	return formatMatchValue(entry?.value);
}

function getMatchMeta(match: unknown): {
	quality: string | null;
	resolution: string | null;
	videoSeconds: string | null;
	videoAudio: string | null;
	inputTokenTier: string | null;
} {
	return {
		quality: findMatchValue(match, "image_params.quality"),
		resolution:
			findMatchValue(match, "image_params.resolution") ??
			findMatchValue(match, "video_params.resolution"),
		videoSeconds: findMatchValue(match, "video_params.seconds"),
		videoAudio: findMatchValue(match, "video_params.audio"),
		inputTokenTier: getInputTokenTierLabel(match),
	};
}

function getVariantLabel(matchMeta: {
	quality: string | null;
	resolution: string | null;
	videoSeconds: string | null;
	videoAudio: string | null;
	inputTokenTier: string | null;
}): string | null {
	const hasVideoMeta = Boolean(matchMeta.videoSeconds || matchMeta.videoAudio);
	if (hasVideoMeta) {
		const videoParts = [
			matchMeta.resolution,
			matchMeta.videoSeconds,
			matchMeta.videoAudio,
		].filter((value): value is string => Boolean(value));
		if (videoParts.length > 0) return videoParts.join(", ");
	}

	const imageParts = [matchMeta.quality, matchMeta.resolution].filter(
		(value): value is string => Boolean(value),
	);
	if (imageParts.length > 0) return imageParts.map((part) => toTitleCase(part)).join(", ");

	if (matchMeta.inputTokenTier) return matchMeta.inputTokenTier;

	return null;
}

async function fetchPricingSupplements(
	rpcRows: MonitorModelRpcRow[],
): Promise<Map<string, PricingSupplement>> {
	const supabase = createAdminClient();
	const modelKeys = Array.from(
		new Set(
			rpcRows
				.map((row) =>
					row.provider_id && row.api_model_id && row.capability_id
						? `${row.provider_id}:${row.api_model_id}:${row.capability_id}`
						: "",
				)
				.filter(Boolean),
		),
	);
	if (modelKeys.length === 0) return new Map();

	const pricingRows: PricingRuleSupplementRow[] = [];
	for (let index = 0; index < modelKeys.length; index += 200) {
		const chunk = modelKeys.slice(index, index + 200);
		for (let from = 0; ; from += PRICING_RULE_PAGE_SIZE) {
			const to = from + PRICING_RULE_PAGE_SIZE - 1;
			const { data, error } = await supabase
				.from("data_api_pricing_rules")
				.select(
					"model_key, pricing_plan, meter, note, unit, unit_size, price_per_unit, effective_from, effective_to, match",
				)
				.in("model_key", chunk)
				.range(from, to);
			if (error) throw error;
			const page = (data ?? []) as PricingRuleSupplementRow[];
			pricingRows.push(...page);
			if (page.length < PRICING_RULE_PAGE_SIZE) {
				break;
			}
		}
	}

	const nowMs = Date.now();
	const rowsByKey = new Map<string, PricingRuleSupplementRow[]>();
	for (const row of pricingRows) {
		const modelKey = String(row.model_key ?? "").trim();
		if (!modelKey) continue;
		if (!isRuleActive(row.effective_from, row.effective_to, nowMs)) continue;
		if (String(row.pricing_plan ?? "").trim().toLowerCase() !== "standard") continue;
		const existing = rowsByKey.get(modelKey) ?? [];
		existing.push(row);
		rowsByKey.set(modelKey, existing);
	}

	const result = new Map<string, PricingSupplement>();
	for (const [modelKey, rows] of rowsByKey) {
		const supplement: PricingSupplement = {
			standardInputPrice: null,
			standardOutputPrice: null,
			standardInputPriceLabel: null,
			standardInputPriceUnit: null,
			standardOutputPriceLabel: null,
			standardOutputPriceUnit: null,
			fromPrice: null,
			fromPriceUnit: null,
			pricingDetailRows: [],
		};
		const displayRows: Array<{ price: number; unit: string }> = [];
		const displayUnits = new Set<string>();
		const rawDetailRows: Array<{
			side: "input" | "output";
			baseLabel: string;
			price: number;
			unit: string;
			quality: string | null;
			resolution: string | null;
			videoSeconds: string | null;
			videoAudio: string | null;
			inputTokenTier: string | null;
			variantLabel: string | null;
		}> = [];

		for (const row of rows) {
			const displayPrice = computeDisplayPrice(row);
			const minutePricing = parseMinutePricingNote(row.note);
			const displayUnit = minutePricing
				? minutePricing.unit
				: normalizeDisplayUnit(row.unit);
			if (displayPrice !== null && displayUnit) {
				displayRows.push({ price: displayPrice, unit: displayUnit });
				displayUnits.add(displayUnit);
			}
			const { side, label } = getStandardSideAndLabel(row.meter);
			if (!side || !label || displayPrice === null || !displayUnit) continue;
			const matchMeta = getMatchMeta(row.match);
			rawDetailRows.push({
				side,
				baseLabel: label,
				price: displayPrice,
				unit: displayUnit,
				quality: matchMeta.quality,
				resolution: matchMeta.resolution,
				videoSeconds: matchMeta.videoSeconds,
				videoAudio: matchMeta.videoAudio,
				inputTokenTier: matchMeta.inputTokenTier,
				variantLabel: getVariantLabel(matchMeta),
			});
			if (side === "input") {
				if (
					supplement.standardInputPrice === null ||
					displayPrice < supplement.standardInputPrice
				) {
					supplement.standardInputPrice = displayPrice;
					supplement.standardInputPriceLabel = label;
					supplement.standardInputPriceUnit = displayUnit;
				}
			} else if (
				supplement.standardOutputPrice === null ||
				displayPrice < supplement.standardOutputPrice
			) {
				supplement.standardOutputPrice = displayPrice;
				supplement.standardOutputPriceLabel = label;
				supplement.standardOutputPriceUnit = displayUnit;
			}
		}

		if (displayUnits.size === 1 && displayRows.length > 0) {
			displayRows.sort((a, b) => a.price - b.price);
			supplement.fromPrice = displayRows[0]?.price ?? null;
			supplement.fromPriceUnit = displayRows[0]?.unit ?? null;
		}
		const hasMatchedOutputVariants = rawDetailRows.some(
			(row) => row.side === "output" && Boolean(row.variantLabel),
		);
		const outputBaseLabelsWithVariants = new Set(
			rawDetailRows
				.filter((row) => row.side === "output" && Boolean(row.variantLabel))
				.map((row) => row.baseLabel),
		);
		const dedupRows = Array.from(
			new Map(
				rawDetailRows.map((row) => {
					const label = row.variantLabel
						? `${row.baseLabel} (${row.variantLabel})`
						: row.baseLabel;
					const value = formatDetailValue(row.price, row.unit);
					return [`${label}::${value}`, { label, value }] as const;
				}),
			).values(),
		);
		if (dedupRows.length > 6) {
			const groupedRows: Array<{ label: string; value: string }> = [];
			const inputGroups = new Map<string, { unit: string; prices: number[] }>();
			const outputQualityGroups = new Map<string, { unit: string; prices: number[] }>();
			const otherOutputGroups = new Map<string, { unit: string; prices: number[] }>();

			for (const row of rawDetailRows) {
				if (
					hasMatchedOutputVariants &&
					row.side === "output" &&
					!row.variantLabel &&
					outputBaseLabelsWithVariants.has(row.baseLabel)
				) {
					continue;
				}
				if (row.side === "input") {
					const label = row.variantLabel
						? `${row.baseLabel} (${row.variantLabel})`
						: row.baseLabel;
					const group = inputGroups.get(label) ?? {
						unit: row.unit,
						prices: [],
					};
					group.prices.push(row.price);
					inputGroups.set(label, group);
					continue;
				}
				if (row.quality) {
					const label = `${row.baseLabel} (${toTitleCase(row.quality)})`;
					const group = outputQualityGroups.get(label) ?? {
						unit: row.unit,
						prices: [],
					};
					group.prices.push(row.price);
					outputQualityGroups.set(label, group);
					continue;
				}
				const label = row.variantLabel
					? `${row.baseLabel} (${row.variantLabel})`
					: row.baseLabel;
				const group = otherOutputGroups.get(label) ?? {
					unit: row.unit,
					prices: [],
				};
				group.prices.push(row.price);
				otherOutputGroups.set(label, group);
			}

			for (const [label, group] of inputGroups) {
				groupedRows.push({
					label,
					value: formatDetailValueRange(group.prices, group.unit),
				});
			}
			const qualityOrder = new Map([
				["low", 0],
				["medium", 1],
				["high", 2],
			]);
			for (const [label, group] of Array.from(outputQualityGroups.entries()).sort(
				(a, b) =>
					(qualityOrder.get(a[0].match(/\(([^)]+)\)/)?.[1]?.toLowerCase() ?? "") ?? 99) -
					(qualityOrder.get(b[0].match(/\(([^)]+)\)/)?.[1]?.toLowerCase() ?? "") ?? 99),
			)) {
				groupedRows.push({
					label,
					value: formatDetailValueRange(group.prices, group.unit),
				});
			}
			for (const [label, group] of otherOutputGroups) {
				groupedRows.push({
					label,
					value: formatDetailValueRange(group.prices, group.unit),
				});
			}
			supplement.pricingDetailRows = groupedRows.slice(0, 6);
		} else {
			supplement.pricingDetailRows = dedupRows;
		}

		result.set(modelKey, supplement);
	}

	return result;
}

async function getMonitorModelsCached(
	filters: MonitorModelFilters = {},
	includeHidden: boolean
): Promise<{
	models: MonitorModelData[];
	allTiers: string[];
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allStatuses: string[];
}> {
	"use cache";

	cacheLife("minutes");
	cacheTag("models:monitor");
	cacheTag("monitor-models");
	cacheTag("data:data_api_model_aliases");
	cacheTag("data:data_api_provider_model_capabilities");
	cacheTag("data:data_api_provider_models");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:models");
	cacheTag("data:api_providers");

	const rpcRows = await fetchAllMonitorModelRows(includeHidden);
	const pricingSupplements = await fetchPricingSupplements(rpcRows);

	const featureOrderIndexForRow = new Map(
		featureOrder.map((feature, index) => [feature, index]),
	);
	const allModels: MonitorModelData[] = [];

	for (const raw of (rpcRows ?? []) as MonitorModelRpcRow[]) {
		const row = raw as MonitorModelRpcRow;
		const modelId = String(row.model_id ?? row.api_model_id ?? "").trim();
		if (!modelId) continue;

		const providerInfo: GatewayProvider =
			row.api_provider_name || row.provider_link
				? {
					api_provider_name: row.api_provider_name ?? null,
					link: row.provider_link ?? null,
				}
				: null;

		const gatewayModel = normalizeGatewayModel({
			model_id: modelId,
			api_model_id: row.api_model_id,
			api_provider_id: row.provider_id,
			key: row.provider_id && row.api_model_id && row.capability_id
				? `${row.provider_id}:${row.api_model_id}:${row.capability_id}`
				: "",
			endpoint: row.capability_id,
			is_active_gateway: row.is_active_gateway,
			capability_status: row.capability_status,
			input_modalities: row.input_modalities,
			output_modalities: row.output_modalities,
			params: row.capability_params ?? {},
			provider: providerInfo,
		});

		const extractedFeatures = extractFeatureKeys(gatewayModel.params);
		const supportedParameters = extractSupportedParameters(gatewayModel.params);
		const isFreeVariant = Boolean(row.is_free_variant);
		const normalizedFeatures = new Set<string>(
			extractedFeatures.map((feature) => String(feature)),
		);
		if (isFreeVariant) normalizedFeatures.add("free");
		const sortedFeatures = Array.from(normalizedFeatures).sort((a, b) => {
			const aIndex = featureOrderIndexForRow.get(a);
			const bIndex = featureOrderIndexForRow.get(b);
			if (aIndex !== undefined || bIndex !== undefined) {
				if (aIndex === undefined) return 1;
				if (bIndex === undefined) return -1;
				return aIndex - bIndex;
			}
			return a.localeCompare(b);
		});

		const providerName =
			gatewayModel.provider?.api_provider_name || gatewayModel.api_provider_id;
		const providerContext = Number(row.context_length ?? Number.NaN);
		const providerMaxOutput = Number(
			row.provider_max_output_tokens ?? Number.NaN,
		);
		const capMaxInput = Number(row.capability_max_input_tokens ?? Number.NaN);
		const capMaxOutput = Number(row.capability_max_output_tokens ?? Number.NaN);
		const context =
			Number.isFinite(providerContext) && providerContext > 0
				? providerContext
				: Number.isFinite(capMaxInput) && capMaxInput > 0
					? capMaxInput
					: 0;
		const maxOutput =
			Number.isFinite(providerMaxOutput) && providerMaxOutput > 0
				? providerMaxOutput
				: Number.isFinite(capMaxOutput) && capMaxOutput > 0
					? capMaxOutput
					: 0;
		const quantization =
			typeof row.quantization_scheme === "string" &&
			row.quantization_scheme.trim()
				? row.quantization_scheme
				: undefined;
		const modelKey =
			row.provider_id && row.api_model_id && row.capability_id
				? `${row.provider_id}:${row.api_model_id}:${row.capability_id}`
				: "";
		const pricingSupplement = pricingSupplements.get(modelKey);

		const useSupplementInputStandard = shouldPreferSupplementStandardPrice(
			row.standard_input_price_unit,
			pricingSupplement?.standardInputPriceUnit,
		);
		const useSupplementOutputStandard = shouldPreferSupplementStandardPrice(
			row.standard_output_price_unit,
			pricingSupplement?.standardOutputPriceUnit,
		);
		const useSupplementFromPrice = shouldPreferSupplementStandardPrice(
			row.from_price_unit,
			pricingSupplement?.fromPriceUnit,
		);

		const monitorModel: MonitorModelData = {
			id: `${modelId}-${gatewayModel.api_provider_id}-${gatewayModel.key}`,
			model: String(row.model_name ?? modelId).trim() || modelId,
			modelId,
			apiModelId: row.api_model_id ?? undefined,
			organisationId: row.organisation_id ?? undefined,
			organisationName: row.organisation_name ?? undefined,
			provider: {
				name: providerName ?? gatewayModel.api_provider_id,
				id: gatewayModel.api_provider_id,
				inputPrice: Number(row.input_price ?? 0) || 0,
				outputPrice: Number(row.output_price ?? 0) || 0,
				standardInputPrice:
					!useSupplementInputStandard &&
					row.standard_input_price !== null &&
					row.standard_input_price !== undefined &&
					Number.isFinite(Number(row.standard_input_price))
					? Number(row.standard_input_price)
					: pricingSupplement?.standardInputPrice ?? null,
				standardOutputPrice:
					!useSupplementOutputStandard &&
					row.standard_output_price !== null &&
					row.standard_output_price !== undefined &&
					Number.isFinite(Number(row.standard_output_price))
					? Number(row.standard_output_price)
					: pricingSupplement?.standardOutputPrice ?? null,
				standardInputPriceLabel:
					(!useSupplementInputStandard ? row.standard_input_price_label : null) ??
					pricingSupplement?.standardInputPriceLabel ??
					null,
				standardInputPriceUnit:
					(!useSupplementInputStandard ? row.standard_input_price_unit : null) ??
					pricingSupplement?.standardInputPriceUnit ??
					null,
				standardOutputPriceLabel:
					(!useSupplementOutputStandard ? row.standard_output_price_label : null) ??
					pricingSupplement?.standardOutputPriceLabel ??
					null,
				standardOutputPriceUnit:
					(!useSupplementOutputStandard ? row.standard_output_price_unit : null) ??
					pricingSupplement?.standardOutputPriceUnit ??
					null,
				fromPrice:
					!useSupplementFromPrice &&
					row.from_price !== null &&
					row.from_price !== undefined &&
					Number.isFinite(Number(row.from_price))
					? Number(row.from_price)
					: pricingSupplement?.fromPrice ?? null,
				fromPriceUnit:
					(!useSupplementFromPrice ? row.from_price_unit : null) ??
					pricingSupplement?.fromPriceUnit ??
					null,
				pricingDetailRows: pricingSupplement?.pricingDetailRows ?? [],
				features: sortedFeatures,
			},
			endpoint: normalizeEndpoint(String(row.capability_id ?? "")),
			gatewayStatus: resolveGatewayStatus(
				gatewayModel.is_active_gateway,
				gatewayModel.capability_status,
			),
			inputModalities: (() => {
				const gatewayValues = parseModalities(gatewayModel.input_modalities);
				return gatewayValues.length > 0
					? gatewayValues
					: parseModalities(row.model_input_types);
			})(),
			outputModalities: (() => {
				const gatewayValues = parseModalities(gatewayModel.output_modalities);
				return gatewayValues.length > 0
					? gatewayValues
					: parseModalities(row.model_output_types);
			})(),
			context,
			maxOutput,
			quantization,
			supportedParameters,
			effectiveFrom: row.effective_from ?? undefined,
			tier: isFreeVariant ? "free" : String(row.pricing_tier ?? "standard"),
			added: row.model_release_date ?? undefined,
			retired: row.model_retirement_date
				? new Date(row.model_retirement_date).toISOString().split("T")[0]
				: undefined,
			weeklyTokensModel: toNullableNumber(row.weekly_tokens_model),
			weeklyTokensModelProvider: toNullableNumber(
				row.weekly_tokens_model_provider,
			),
			weeklyThroughputModel: toNullableNumber(row.weekly_throughput_model),
			weeklyLatencyModel: toNullableNumber(row.weekly_latency_model),
		};

		allModels.push(monitorModel);
	}

	const endpointsSet = new Set<string>();
	const modalitiesSet = new Set<string>();
	const featuresSet = new Set<string>();
	const statusesSet = new Set<string>();

	for (const model of allModels) {
		const endpoint = normalizeEndpoint(model.endpoint);
		if (endpoint) endpointsSet.add(endpoint);
		model.inputModalities.forEach((mod) => modalitiesSet.add(mod));
		model.outputModalities.forEach((mod) => modalitiesSet.add(mod));
		model.provider.features.forEach((feat) => featuresSet.add(feat));
		statusesSet.add(model.gatewayStatus);
	}

	const allEndpoints = Array.from(endpointsSet).sort();
	const allModalities = Array.from(modalitiesSet).sort();
	const allTiers = Array.from(
		new Set(
			allModels
				.map((item) => String(item.tier ?? "").trim().toLowerCase())
				.filter(Boolean),
		),
	).sort();
	const featureOrderIndex = new Map(
		featureOrder.map((feature, index) => [feature, index])
	);
	const allFeatures = Array.from(featuresSet).sort((a, b) => {
		const aIndex = featureOrderIndex.get(a);
		const bIndex = featureOrderIndex.get(b);
		if (aIndex !== undefined || bIndex !== undefined) {
			if (aIndex === undefined) return 1;
			if (bIndex === undefined) return -1;
			return aIndex - bIndex;
		}
		return a.localeCompare(b);
	});
	const allStatuses = Array.from(statusesSet).sort();

	const normalizedFilters: Required<MonitorModelFilters> = {
		search: filters.search?.trim() || "",
		inputModalities: filters.inputModalities ?? [],
		outputModalities: filters.outputModalities ?? [],
		features: filters.features ?? [],
		endpoints: filters.endpoints ?? [],
		statuses: (filters.statuses ?? []).map((status) =>
			normalizeCapabilityStatus(status),
		),
		tiers: filters.tiers ?? [],
		year: filters.year ?? 0,
		sortField: filters.sortField || "added",
		sortDirection: filters.sortDirection === "asc" ? "asc" : "desc",
	};

	const filteredModels = allModels.filter((item) => {
		if (normalizedFilters.search) {
			const searchLower = normalizedFilters.search.toLowerCase();
			const matchesSearch = Object.values(item).some((value) => {
				if (Array.isArray(value)) {
					return value.some((v) =>
						String(v).toLowerCase().includes(searchLower)
					);
				}
				if (typeof value === "object" && value !== null) {
					return Object.values(value).some((nestedValue) => {
						if (Array.isArray(nestedValue)) {
							return nestedValue.some((v) =>
								String(v).toLowerCase().includes(searchLower)
							);
						}
						return String(nestedValue)
							.toLowerCase()
							.includes(searchLower);
					});
				}
				return String(value).toLowerCase().includes(searchLower);
			});
			if (!matchesSearch) return false;
		}

		if (normalizedFilters.year > 0) {
			const itemYear = item.added
				? new Date(item.added).getFullYear()
				: null;
			if (itemYear !== normalizedFilters.year) return false;
		}

		if (normalizedFilters.inputModalities.length > 0) {
			const hasAllInputs = normalizedFilters.inputModalities.every((mod) =>
				item.inputModalities.includes(mod)
			);
			if (!hasAllInputs) return false;
		}

		if (normalizedFilters.outputModalities.length > 0) {
			const hasAllOutputs = normalizedFilters.outputModalities.every(
				(mod) => item.outputModalities.includes(mod)
			);
			if (!hasAllOutputs) return false;
		}

		if (normalizedFilters.features.length > 0) {
			const hasAllFeatures = normalizedFilters.features.every((feat) =>
				item.provider.features.includes(feat)
			);
			if (!hasAllFeatures) return false;
		}

		if (normalizedFilters.endpoints.length > 0) {
			const endpoint = normalizeEndpoint(item.endpoint);
			if (!normalizedFilters.endpoints.includes(endpoint)) return false;
		}

		if (normalizedFilters.statuses.length > 0) {
			if (!normalizedFilters.statuses.includes(item.gatewayStatus))
				return false;
		}

		if (normalizedFilters.tiers.length > 0) {
			const tier = item.tier || "standard";
			if (!normalizedFilters.tiers.includes(tier)) return false;
		}

		return true;
	});

	const sortField = normalizedFilters.sortField;
	const sortDirection = normalizedFilters.sortDirection;

	const models = filteredModels.sort((a, b) => {
		let aValue: any;
		let bValue: any;

		if (sortField === "added" || sortField === "retired") {
			const field = sortField as "added" | "retired";
			const aHasDate = !!a[field];
			const bHasDate = !!b[field];

			if (aHasDate && bHasDate) {
				const aDate = new Date(a[field]!).getTime();
				const bDate = new Date(b[field]!).getTime();
				return sortDirection === "asc" ? aDate - bDate : bDate - aDate;
			}
			if (aHasDate && !bHasDate) return -1;
			if (!aHasDate && bHasDate) return 1;
			return 0;
		}

		switch (sortField) {
			case "model":
				aValue = a.model;
				bValue = b.model;
				break;
			case "provider":
				aValue = a.provider.name;
				bValue = b.provider.name;
				break;
			case "endpoint":
				aValue = normalizeEndpoint(a.endpoint);
				bValue = normalizeEndpoint(b.endpoint);
				break;
			case "inputPrice":
				aValue = a.provider.inputPrice;
				bValue = b.provider.inputPrice;
				break;
			case "outputPrice":
				aValue = a.provider.outputPrice;
				bValue = b.provider.outputPrice;
				break;
			case "status":
				aValue = a.gatewayStatus;
				bValue = b.gatewayStatus;
				break;
			case "tier":
				aValue = a.tier || "standard";
				bValue = b.tier || "standard";
				break;
			case "context":
				aValue = a.context;
				bValue = b.context;
				break;
			case "maxOutput":
				aValue = a.maxOutput;
				bValue = b.maxOutput;
				break;
			default:
				aValue = "";
				bValue = "";
		}

		if (typeof aValue === "number" && typeof bValue === "number") {
			return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
		}

		const aStr = String(aValue).toLowerCase();
		const bStr = String(bValue).toLowerCase();
		return sortDirection === "asc"
			? aStr.localeCompare(bStr)
			: bStr.localeCompare(aStr);
	});

	const tiers = new Set(allTiers.length ? allTiers : []);
	tiers.add("standard");

	return {
		models,
		allTiers: Array.from(tiers).sort(),
		allEndpoints,
		allModalities,
		allFeatures,
		allStatuses,
	};
}

export async function getMonitorModels(
	filters: MonitorModelFilters = {},
	includeHidden: boolean,
): Promise<{
	models: MonitorModelData[];
	allTiers: string[];
	allEndpoints: string[];
	allModalities: string[];
	allFeatures: string[];
	allStatuses: string[];
}> {
	return getMonitorModelsCached(filters, includeHidden);
}

