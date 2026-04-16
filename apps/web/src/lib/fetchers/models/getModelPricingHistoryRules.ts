import { cacheLife, cacheTag } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ProviderPricing } from "@/lib/fetchers/models/getModelPricing";

const DEFAULT_DAYS = 30;
const PAGE_SIZE = 1000;
const RULE_SELECT =
	"rule_id, model_key, pricing_plan, meter, unit, unit_size, price_per_unit, currency, priority, effective_from, effective_to, note, match";

type PricingRuleRow = {
	rule_id: string | null;
	model_key: string | null;
	pricing_plan: string | null;
	meter: string | null;
	unit: string | null;
	unit_size: number | null;
	price_per_unit: number | null;
	currency: string | null;
	priority: number | null;
	effective_from: string | null;
	effective_to: string | null;
	note: string | null;
	match: unknown[] | null;
};

export type ModelPricingHistoryRule = {
	ruleId: string;
	providerId: string;
	providerName: string;
	modelKey: string;
	pricingPlan: string;
	meter: string;
	unit: string;
	unitSize: number;
	pricePerUnit: number;
	pricePer1MUnits: number;
	currency: string;
	priority: number;
	effectiveFrom: string | null;
	effectiveTo: string | null;
	note: string | null;
	match: unknown[];
};

function extractModelIdFromModelKey(modelKey: string): string {
	const firstColon = modelKey.indexOf(":");
	const lastColon = modelKey.lastIndexOf(":");
	if (firstColon < 0 || lastColon <= firstColon) return "";
	return modelKey.slice(firstColon + 1, lastColon).trim();
}

function shouldTreatRuleAsFree(
	modelKey: string,
	note: string | null | undefined,
): boolean {
	const normalizedModelId = extractModelIdFromModelKey(modelKey).toLowerCase();
	const normalizedNote = String(note ?? "").trim().toLowerCase();
	return (
		normalizedModelId.endsWith(":free") ||
		normalizedModelId.endsWith("-free") ||
		normalizedNote === "free" ||
		normalizedNote.startsWith("free ")
	);
}

function normalizePricingPlanForRule(
	pricingPlan: string | null | undefined,
	modelKey: string,
	note: string | null | undefined,
): string {
	const normalizedPlan = String(pricingPlan ?? "").trim().toLowerCase();
	const inferredFree = shouldTreatRuleAsFree(modelKey, note);

	if (!normalizedPlan) {
		return inferredFree ? "free" : "standard";
	}
	if (normalizedPlan === "standard" && inferredFree) {
		return "free";
	}
	return normalizedPlan;
}

function toMs(
	value: string | null | undefined,
	fallback: number,
): number {
	if (!value) return fallback;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : fallback;
}

function intersectsWindow(
	effectiveFrom: string | null | undefined,
	effectiveTo: string | null | undefined,
	windowStartMs: number,
	windowEndMs: number,
): boolean {
	const fromMs = toMs(effectiveFrom, Number.NEGATIVE_INFINITY);
	const toMsValue = toMs(effectiveTo, Number.POSITIVE_INFINITY);
	return toMsValue >= windowStartMs && fromMs <= windowEndMs;
}

async function fetchRulesByModelKeys(
	client: ReturnType<typeof createAdminClient>,
	modelKeys: string[],
): Promise<PricingRuleRow[]> {
	if (!modelKeys.length) return [];
	const rows: PricingRuleRow[] = [];

	for (let from = 0; ; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await client
			.from("data_api_pricing_rules")
			.select(RULE_SELECT)
			.in("model_key", modelKeys)
			.order("priority", { ascending: false })
			.order("effective_from", { ascending: false })
			.range(from, to);

		if (error) {
			throw new Error(error.message ?? "Failed to fetch pricing history rules");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as PricingRuleRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

async function fetchRulesByPrefix(
	client: ReturnType<typeof createAdminClient>,
	prefix: string,
): Promise<PricingRuleRow[]> {
	const rows: PricingRuleRow[] = [];

	for (let from = 0; ; from += PAGE_SIZE) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await client
			.from("data_api_pricing_rules")
			.select(RULE_SELECT)
			.like("model_key", `${prefix}%`)
			.order("priority", { ascending: false })
			.order("effective_from", { ascending: false })
			.range(from, to);

		if (error) {
			throw new Error(error.message ?? "Failed to fetch pricing history rules");
		}
		if (!Array.isArray(data) || data.length === 0) break;
		rows.push(...(data as PricingRuleRow[]));
		if (data.length < PAGE_SIZE) break;
	}

	return rows;
}

export async function getModelPricingHistoryRules(args: {
	modelId: string;
	providers: ProviderPricing[];
	days?: number;
}): Promise<ModelPricingHistoryRule[]> {
	"use cache";

	cacheLife("hours");
	cacheTag("data:data_api_pricing_rules");
	cacheTag("data:data_api_provider_models");
	cacheTag(`data:models:${args.modelId}`);

	const days = Number.isFinite(args.days) && (args.days ?? 0) > 0
		? Math.round(args.days as number)
		: DEFAULT_DAYS;
	const nowMs = Date.now();
	const windowStartMs = nowMs - days * 24 * 60 * 60 * 1000;

	const providerNameById = new Map<string, string>();
	const providerByKey = new Map<string, string>();
	const providerByPrefix = new Map<string, string>();
	for (const provider of args.providers) {
		const providerId = provider.provider.api_provider_id;
		providerNameById.set(
			providerId,
			provider.provider.api_provider_name || providerId,
		);
		for (const model of provider.provider_models) {
			const key = `${model.api_provider_id}:${model.model_id}:${model.endpoint}`;
			const prefix = `${model.api_provider_id}:${model.model_id}:`;
			providerByKey.set(key, providerId);
			providerByPrefix.set(prefix, providerId);
		}
	}

	const modelKeys = Array.from(providerByKey.keys()).filter(Boolean);
	const prefixes = Array.from(providerByPrefix.keys()).filter(Boolean);
	if (!modelKeys.length || !prefixes.length) return [];
	const client = createAdminClient();

	const primaryRows = await fetchRulesByModelKeys(client, modelKeys);
	const knownPrefixes = new Set<string>();
	for (const row of primaryRows) {
		const modelKey = String(row.model_key ?? "");
		const lastColon = modelKey.lastIndexOf(":");
		if (lastColon <= 0) continue;
		knownPrefixes.add(`${modelKey.slice(0, lastColon)}:`);
	}

	const missingPrefixes = prefixes.filter((prefix) => !knownPrefixes.has(prefix));
	const fallbackRows = (
		await Promise.all(
			missingPrefixes.map((prefix) =>
				fetchRulesByPrefix(client, prefix).catch((error) => {
					console.warn("[pricing] failed to fetch fallback history rules", {
						modelId: args.modelId,
						prefix,
						error,
					});
					return [];
				}),
			),
		)
	).flat();

	const dedupedRows = new Map<string, PricingRuleRow>();
	for (const row of [...primaryRows, ...fallbackRows]) {
		const ruleId = String(row.rule_id ?? "").trim();
		if (!ruleId) continue;
		dedupedRows.set(ruleId, row);
	}

	const historyRules: ModelPricingHistoryRule[] = [];
	for (const row of dedupedRows.values()) {
		const ruleId = String(row.rule_id ?? "").trim();
		const modelKey = String(row.model_key ?? "").trim();
		const meter = String(row.meter ?? "").trim().toLowerCase();
		const unit = String(row.unit ?? "").trim().toLowerCase() || "token";
		const unitSize = Number(row.unit_size ?? 1);
		const pricePerUnit = Number(row.price_per_unit ?? Number.NaN);
		if (!ruleId || !modelKey || !meter) continue;
		if (!Number.isFinite(unitSize) || unitSize <= 0) continue;
		if (!Number.isFinite(pricePerUnit) || pricePerUnit < 0) continue;
		if (
			!intersectsWindow(
				row.effective_from,
				row.effective_to,
				windowStartMs,
				nowMs,
			)
		) {
			continue;
		}

		const lastColon = modelKey.lastIndexOf(":");
		const prefix = lastColon > 0 ? `${modelKey.slice(0, lastColon)}:` : null;
		const providerId = providerByKey.get(modelKey)
			|| (prefix ? providerByPrefix.get(prefix) : undefined);
		if (!providerId) continue;

		const providerName = providerNameById.get(providerId) ?? providerId;
		const pricingPlan = normalizePricingPlanForRule(
			row.pricing_plan,
			modelKey,
			row.note,
		);
		historyRules.push({
			ruleId,
			providerId,
			providerName,
			modelKey,
			pricingPlan,
			meter,
			unit,
			unitSize,
			pricePerUnit,
			pricePer1MUnits: pricePerUnit * (1_000_000 / unitSize),
			currency: String(row.currency ?? "USD"),
			priority: Number(row.priority ?? 100),
			effectiveFrom: row.effective_from,
			effectiveTo: row.effective_to,
			note: row.note ?? null,
			match: Array.isArray(row.match) ? row.match : [],
		});
	}

	return historyRules.sort((a, b) => {
		if (a.providerName !== b.providerName) {
			return a.providerName.localeCompare(b.providerName);
		}
		if (a.meter !== b.meter) return a.meter.localeCompare(b.meter);
		const aFrom = toMs(a.effectiveFrom, Number.NEGATIVE_INFINITY);
		const bFrom = toMs(b.effectiveFrom, Number.NEGATIVE_INFINITY);
		return bFrom - aFrom;
	});
}
