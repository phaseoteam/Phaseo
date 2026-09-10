import type { ModelOverviewPage } from "@/lib/fetchers/models/getModel";
import type { PricingRule, ProviderPricing } from "@/lib/fetchers/models/getModelPricing";

export type OgEntity = "organisations" | "models" | "benchmarks" | "api-providers" | "countries" | "subscription-plans";
export type OgStat = {
	label: string;
	value: string;
	originalValue?: string;
	helper?: string;
	promotion?: string;
};
export type OgPayload = {
	id: string;
	name: string;
	logoId?: string;
	subtitle?: string;
	badge?: string;
	stats?: OgStat[];
	flagEmoji?: string;
};

type PriceCandidate = {
	providerId: string;
	rule: PricingRule;
	pricePerMillion: number;
};

const OG_METER_NAMES = {
	input: new Set(["input_tokens", "input_text_tokens"]),
	output: new Set(["output_tokens", "output_text_tokens"]),
} as const;

function formatOgPrice(value: number): string {
	if (value === 0) return "$0";
	if (value < 0.01) return `$${value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
	return `$${value.toFixed(2)}`;
}

function formatOgContext(value: number): string {
	if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2).replace(/\.0+$/, "")}M`;
	if (value >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1).replace(/\.0$/, "")}K`;
	return value.toLocaleString("en-US");
}

function formatOgDate(value: string | null | undefined): string | undefined {
	if (!value) return undefined;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return undefined;
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(date);
}

function isCurrentPricingRule(rule: PricingRule, nowMs: number): boolean {
	const effectiveFrom = rule.effective_from ? Date.parse(rule.effective_from) : Number.NEGATIVE_INFINITY;
	const effectiveTo = rule.effective_to ? Date.parse(rule.effective_to) : Number.POSITIVE_INFINITY;
	return (
		(!Number.isFinite(effectiveFrom) || effectiveFrom <= nowMs) &&
		(!Number.isFinite(effectiveTo) || effectiveTo > nowMs)
	);
}

function parsePromotionPercent(note: string | null | undefined): number | null {
	const match = String(note ?? "").match(/(\d+(?:\.\d+)?)\s*%\s*(?:off|discount)/i);
	if (!match) return null;
	const percent = Number(match[1]);
	return Number.isFinite(percent) && percent > 0 && percent < 100 ? percent : null;
}

function formatPromotionPercent(percent: number): string {
	const formatted = Number.isInteger(percent) ? String(percent) : percent.toFixed(1).replace(/\.0$/, "");
	return `${formatted}% off`;
}

function pricingMatchSignature(rule: PricingRule): string {
	return JSON.stringify(rule.match ?? []);
}

function pricingBaselineKey(candidate: PriceCandidate): string {
	return [candidate.providerId, candidate.rule.meter, candidate.rule.pricing_plan].join("\u0000");
}

function getPromotionCandidate(listCandidate: PriceCandidate, candidates: PriceCandidate[]): PriceCandidate | null {
	return candidates
		.filter((peer) =>
			peer.providerId === listCandidate.providerId &&
			peer.rule.meter === listCandidate.rule.meter &&
			peer.rule.pricing_plan === listCandidate.rule.pricing_plan &&
			pricingMatchSignature(peer.rule) === pricingMatchSignature(listCandidate.rule) &&
			peer.rule.priority > listCandidate.rule.priority &&
			peer.pricePerMillion < listCandidate.pricePerMillion,
		)
		.reduce<PriceCandidate | null>(
			(current, candidate) =>
				current == null || candidate.pricePerMillion < current.pricePerMillion ? candidate : current,
			null,
		);
}

function getPromotionPercent(listCandidate: PriceCandidate, candidates: PriceCandidate[]): number | null {
	const promotion = getPromotionCandidate(listCandidate, candidates);
	if (!promotion || listCandidate.pricePerMillion <= 0) return null;

	const explicitPercent = parsePromotionPercent(promotion.rule.note);
	if (explicitPercent != null) return explicitPercent;

	const percent = Math.round(
		((listCandidate.pricePerMillion - promotion.pricePerMillion) / listCandidate.pricePerMillion) * 100,
	);
	return percent > 0 && percent < 100 ? percent : null;
}

export function buildModelOgStats(model: ModelOverviewPage | null, pricing: ProviderPricing[]): OgStat[] {
	const contextLengths = pricing
		.flatMap((entry) => entry.provider_models)
		.map((providerModel) => Number(providerModel.context_length ?? 0))
		.filter((value) => Number.isFinite(value) && value > 0);
	const detailContext = model?.model_details.find((detail) => detail.detail_name === "input_context_length")?.detail_value;
	if (detailContext != null) contextLengths.push(Number(detailContext));
	const context = contextLengths.length ? Math.max(...contextLengths) : null;

	const nowMs = Date.now();
	const standardCandidates = pricing.flatMap((entry): PriceCandidate[] =>
		entry.pricing_rules
			.filter((rule) => rule.pricing_plan.toLowerCase() === "standard" && isCurrentPricingRule(rule, nowMs))
			.map((rule) => ({
				providerId: entry.provider.api_provider_id,
				rule,
				pricePerMillion:
					Number(rule.price_per_unit) * (1_000_000 / Number(rule.unit_size || 1_000_000)),
			}))
			.filter((candidate) => Number.isFinite(candidate.pricePerMillion) && candidate.pricePerMillion >= 0),
	);
	const unconditionalCandidates = standardCandidates.filter((candidate) => candidate.rule.match.length === 0);
	const unconditionalKeys = new Set(unconditionalCandidates.map(pricingBaselineKey));
	const baselinePriorities = new Map<string, number>();
	for (const candidate of standardCandidates) {
		const key = pricingBaselineKey(candidate);
		if (unconditionalKeys.has(key) && candidate.rule.match.length !== 0) continue;
		const existing = baselinePriorities.get(key);
		if (existing == null || candidate.rule.priority < existing) {
			baselinePriorities.set(key, candidate.rule.priority);
		}
	}
	const listCandidates = standardCandidates.filter((candidate) => {
		const key = pricingBaselineKey(candidate);
		return baselinePriorities.get(key) === candidate.rule.priority &&
			(!unconditionalKeys.has(key) || candidate.rule.match.length === 0);
	});
	const priceFor = (meter: string): { value: number; originalValue?: number; promotion?: string } | null => {
		const meterCandidates = listCandidates.filter((candidate) =>
			OG_METER_NAMES[meter as keyof typeof OG_METER_NAMES]?.has(candidate.rule.meter) &&
			["token", "tokens"].includes(candidate.rule.unit.toLowerCase()),
		);
		const cheapest = meterCandidates.reduce<PriceCandidate | null>(
			(current, candidate) =>
				current == null || candidate.pricePerMillion < current.pricePerMillion ? candidate : current,
			null,
		);
		if (!cheapest) return null;
		const promotionCandidate = getPromotionCandidate(cheapest, standardCandidates);
		const promotionPercent = getPromotionPercent(cheapest, standardCandidates);
		const hasPromotion = promotionCandidate != null && promotionPercent != null;
		return {
			value: promotionCandidate && promotionPercent != null
				? promotionCandidate.pricePerMillion
				: cheapest.pricePerMillion,
			...(hasPromotion ? { originalValue: cheapest.pricePerMillion } : {}),
			...(promotionPercent != null ? { promotion: formatPromotionPercent(promotionPercent) } : {}),
		};
	};

	const stats: OgStat[] = [];
	if (context) stats.push({ label: "CONTEXT", value: formatOgContext(context), helper: "tokens" });
	const inputPrice = priceFor("input");
	if (inputPrice != null) {
		stats.push({
			label: "INPUT",
			value: formatOgPrice(inputPrice.value),
			...(inputPrice.originalValue == null ? {} : { originalValue: formatOgPrice(inputPrice.originalValue) }),
			helper: "per 1M tokens",
			promotion: inputPrice.promotion,
		});
	}
	const outputPrice = priceFor("output");
	if (outputPrice != null) {
		stats.push({
			label: "OUTPUT",
			value: formatOgPrice(outputPrice.value),
			...(outputPrice.originalValue == null ? {} : { originalValue: formatOgPrice(outputPrice.originalValue) }),
			helper: "per 1M tokens",
			promotion: outputPrice.promotion,
		});
	}
	const releaseDate = formatOgDate(model?.release_date ?? model?.announcement_date);
	if (releaseDate) stats.push({ label: "RELEASED", value: releaseDate });
	return stats;
}
