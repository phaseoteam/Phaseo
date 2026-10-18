// Purpose: Check catalogue price cards for data that cannot be right, independently of the engine.
// Why: A wrong row bills wrongly even when the engine is correct; these are fixed in the database, not in code.
// How: Compares rules of one card within the same plan and condition set (cache read vs input, 1h vs 5m writes,
//      reasoning vs output), and flags cards with no current rules, foreign currency, conditions the engine cannot
//      read, overlapping aggregate meters, ambiguous duplicates and card-level fields the engine ignores.

import type { Mismatch, Source } from "../src/expect/types";
import { parseDecimal } from "./calculator";
import { SWEEP_NOW_MS, type SweepCard, type SweepRoute } from "./catalogue-cards";
import { cacheWritesDocumented, normaliseCondition, providerDocumentsCache } from "./cases";

const ANTHROPIC_PRICING: Source = {
	kind: "docs",
	url: "https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching",
	note: "5-minute cache write 1.25x base input; 1-hour cache write 2x; cache read 0.1x (0.05x or 0.025x on some models). Partner platforms (Bedrock, Google Cloud) set their own prices.",
};
const GEMINI_PRICING: Source = {
	kind: "docs",
	url: "https://ai.google.dev/gemini-api/docs/pricing",
	note: "\"Output price (including thinking tokens)\"; cached input is roughly 10% of input on most models.",
};
const OPENAI_REASONING: Source = {
	kind: "docs",
	url: "https://developers.openai.com/api/docs/guides/reasoning",
	note: "Reasoning tokens \"are billed as output tokens\".",
};

/** Providers whose thinking-mode output price covers the whole completion, so a separate reasoning price is right. */
export const THINKING_MODE_PRICING: Record<string, Source> = {
	"alibaba-cloud": {
		kind: "docs",
		url: "https://www.alibabacloud.com/help/en/model-studio/model-pricing",
		note: "Output price column \"Thinking mode (chain of thought + answer)\": in thinking mode the answer is billed at the thinking price as well.",
	},
};

function isClaude(apiModelId: string): boolean {
	return /claude|anthropic\//i.test(apiModelId);
}

function isGemini(apiModelId: string): boolean {
	return /gemini/i.test(apiModelId);
}

function cacheSource(card: SweepCard): Source {
	if (isClaude(card.apiModelId)) return ANTHROPIC_PRICING;
	if (isGemini(card.apiModelId) && /^google/.test(card.providerId)) return GEMINI_PRICING;
	return { kind: "assumed", reason: "Provider pricing page not checked; a cache hit that costs nothing, or as much as uncached input, contradicts what prompt caching is (apps/docs/v1/guides/prompt-caching.mdx: \"Cache reads are usually cheaper\")." };
}

function reasoningSource(card: SweepCard): Source {
	if (/^openai|^azure/.test(card.providerId) || /^openai\//.test(card.apiModelId)) return OPENAI_REASONING;
	if (isGemini(card.apiModelId)) return GEMINI_PRICING;
	return { kind: "assumed", reason: "Provider pricing page not checked; OpenAI and Google bill reasoning at the output price, and a separate reasoning price needs a provider source." };
}

/** USD per unit as a float, only for comparisons. */
function perUnit(rule: { price_per_unit: string; unit_size: number }): number {
	const { num, den } = parseDecimal(rule.price_per_unit);
	return Number(num) / Number(den) / Number(rule.unit_size || 1);
}

function family(capability: string): string {
	return capability === "text.generate" ? "text" : capability;
}

export function checkCard(card: SweepCard, _route: SweepRoute | null): Mismatch[] {
	const out: Mismatch[] = [];
	const push = (check: string, entry: Omit<Mismatch, "layer" | "provider" | "family" | "model" | "surface" | "caseId">) => {
		out.push({ layer: "pricing", provider: card.providerId, family: family(card.capability), model: card.apiModelId, surface: card.capability, caseId: `catalogue:${check}`, ...entry });
	};

	if (!card.rules.length) {
		const now = SWEEP_NOW_MS;
		const future = card.fixtureRules.some((rule) => rule.effective_from && Date.parse(rule.effective_from) > now);
		push("no-current-rules", {
			kind: "wrong_value",
			path: "catalogue.effective_to",
			expected: "at least one rule in effect for an active route",
			actual: card.fixtureRules.map((rule) => [rule.meter, rule.pricing_plan, rule.effective_from ?? null, rule.effective_to ?? null]),
			source: { kind: "assumed", reason: "An active route whose card has no rule in effect fails with pricing_card_missing_for_executed_route after the provider has served the request (pipeline/after/pricing.ts loadProviderPricing)." },
			note: future ? "every rule starts in the future" : "every rule has expired",
		});
		return out;
	}

	for (const [field, value] of Object.entries(card.unsupportedCardFields)) {
		push(`unsupported-card-field.${field}`, {
			kind: "dropped",
			path: `catalogue.${field}`,
			expected: value,
			actual: null,
			source: { kind: "assumed", reason: `The card sets ${field}, which neither the pricing loader nor the engine reads, so it is never applied.` },
		});
	}

	const currencies = [...new Set(card.rules.map((rule) => String(rule.currency ?? "USD").toUpperCase()))];
	if (currencies.some((c) => c !== "USD")) {
		push("currency", {
			kind: "wrong_value",
			path: "catalogue.currency",
			expected: "USD",
			actual: currencies,
			source: { kind: "assumed", reason: "Wallet debits are USD; the engine throws pricing_unsupported_currency and the request-context RPC does not filter foreign-currency rules." },
		});
	}

	for (const rule of card.rules) {
		const unreadable = (rule.match ?? []).filter((condition: any) => !condition?.path || !condition?.op);
		if (unreadable.length) {
			push(`unreadable-condition.${rule.meter}`, {
				kind: "wrong_value",
				path: `catalogue.${rule.meter}.match`,
				expected: unreadable.map((condition: any) => normaliseCondition(condition)),
				actual: unreadable,
				source: { kind: "assumed", reason: "pipeline/pricing/conditions.ts reads `path` and `op`; a condition written with field/key/operator never matches, so the rule is never selected." },
				note: `rule ${rule.id} (${rule.pricing_plan})`,
			});
		}
	}

	const meters = new Set<string>(card.rules.map((rule) => rule.meter));
	const aggregateOverlaps = [
		["input_tokens", "input_text_tokens"],
		["output_tokens", "output_text_tokens"],
		["total_tokens", "input_text_tokens"],
		["total_tokens", "output_text_tokens"],
	].filter(([a, b]) => meters.has(a) && meters.has(b));
	if (aggregateOverlaps.length) {
		push("aggregate-overlap", {
			kind: "wrong_value",
			path: `catalogue.${aggregateOverlaps[0][0]}`,
			expected: "either aggregate or per-part token meters",
			actual: aggregateOverlaps,
			source: { kind: "assumed", reason: "The engine always derives input_tokens, output_tokens and total_tokens from usage, so pricing both an aggregate and its part bills the same tokens twice." },
		});
	}

	// Group rules by plan and by their condition set (without cache_ttl, which distinguishes write TTLs).
	const groups = new Map<string, typeof card.rules>();
	for (const rule of card.rules) {
		const conditions = (rule.match ?? []).map((c: any) => normaliseCondition(c)).filter((c) => c.path !== "cache_ttl");
		const key = `${rule.pricing_plan}|${JSON.stringify(conditions)}`;
		groups.set(key, [...(groups.get(key) ?? []), rule]);
	}
	const ttlOf = (rule: (typeof card.rules)[number]): string | null => {
		if (rule.meter.endsWith("_5m")) return "5m";
		if (rule.meter.endsWith("_1h")) return "1h";
		const ttl = (rule.match ?? []).map((c: any) => normaliseCondition(c)).find((c) => c.path === "cache_ttl");
		return ttl ? String(ttl.value) : null;
	};

	for (const [key, rules] of groups) {
		const plan = key.split("|")[0];
		const label = key.length > plan.length + 3 ? `${plan}+conditions` : plan;
		const byMeter = (meter: string) => rules.filter((rule) => rule.meter === meter);
		const input = byMeter("input_text_tokens")[0];
		const output = byMeter("output_text_tokens")[0];
		for (const read of [...byMeter("cached_read_text_tokens"), ...byMeter("implicit_cached_input_text_tokens")]) {
			if (!input) continue;
			const readPrice = perUnit(read as any);
			const inputPrice = perUnit(input as any);
			if (inputPrice > 0 && readPrice === 0) {
				push(`cache-read-free.${label}`, {
					kind: "wrong_value",
					path: `catalogue.${read.meter}.price_per_unit`,
					expected: "> 0 and < input price",
					actual: { cacheRead: read.price_per_unit, input: input.price_per_unit, unit_size: read.unit_size, rule: read.id },
					source: cacheSource(card),
				});
			} else if (inputPrice > 0 && readPrice >= inputPrice) {
				push(`cache-read-not-discounted.${label}`, {
					kind: "wrong_value",
					path: `catalogue.${read.meter}.price_per_unit`,
					expected: "< input price",
					actual: { cacheRead: read.price_per_unit, input: input.price_per_unit, unit_size: read.unit_size, rule: read.id },
					source: cacheSource(card),
				});
			}
		}
		const writes = rules.filter((rule) => rule.meter.startsWith("cached_write_text_tokens"));
		const w5 = writes.find((rule) => ttlOf(rule) === "5m");
		const w1 = writes.find((rule) => ttlOf(rule) === "1h");
		if (w5 && w1 && perUnit(w1 as any) < perUnit(w5 as any)) {
			push(`cache-write-1h-below-5m.${label}`, {
				kind: "wrong_value",
				path: `catalogue.${w1.meter}.price_per_unit`,
				expected: `>= 5m write price ${w5.price_per_unit}`,
				actual: { write1h: w1.price_per_unit, write5m: w5.price_per_unit, rules: [w1.id, w5.id] },
				source: isClaude(card.apiModelId) ? ANTHROPIC_PRICING : { kind: "assumed", reason: "A longer cache lifetime never costs less to write at any provider whose pricing was checked (Anthropic 2x vs 1.25x)." },
			});
		}
		// Claude on Anthropic-priced hosts: 5m writes are 1.25x and 1h writes 2x the input price of the same tier.
		if (input && isClaude(card.apiModelId) && /^(anthropic|amazon-bedrock|google-vertex|azure)/.test(card.providerId)) {
			const inputPrice = perUnit(input as any);
			for (const [write, multiplier] of [[w5, 1.25], [w1, 2]] as const) {
				if (!write || inputPrice <= 0) continue;
				const ratio = perUnit(write as any) / inputPrice;
				if (Math.abs(ratio - multiplier) > 0.01 * multiplier) {
					push(`claude-cache-write-multiplier.${ttlOf(write)}.${label}`, {
						kind: "wrong_value",
						path: `catalogue.${write.meter}.price_per_unit`,
						expected: `${multiplier}x input (${input.price_per_unit}) = ${Number((Number(input.price_per_unit) * multiplier).toPrecision(6))}`,
						actual: { write: write.price_per_unit, ratio: Number(ratio.toFixed(4)), rule: write.id, input: input.id },
						source: ANTHROPIC_PRICING,
						note: /^anthropic/.test(card.providerId) ? undefined : "partner platform: Anthropic says Bedrock and Google Cloud set their own prices; check the platform's page",
					});
				}
			}
		}
		const reasoning = byMeter("output_reasoning_tokens")[0];
		if (reasoning && output && perUnit(reasoning as any) !== perUnit(output as any) && !THINKING_MODE_PRICING[card.providerId]) {
			push(`reasoning-price-differs.${label}`, {
				kind: "wrong_value",
				path: "catalogue.output_reasoning_tokens.price_per_unit",
				expected: output.price_per_unit,
				actual: { reasoning: reasoning.price_per_unit, output: output.price_per_unit, unit_size: reasoning.unit_size, rule: reasoning.id },
				source: reasoningSource(card),
			});
		}
		// Ambiguous duplicates: same meter, same conditions and priority, different price.
		const seen = new Map<string, (typeof card.rules)[number]>();
		for (const rule of rules) {
			const dupKey = `${rule.meter}|${JSON.stringify(rule.match ?? [])}|${rule.priority}`;
			const other = seen.get(dupKey);
			if (other && perUnit(other as any) !== perUnit(rule as any)) {
				push(`ambiguous-duplicate.${rule.meter}.${label}`, {
					kind: "wrong_value",
					path: `catalogue.${rule.meter}.price_per_unit`,
					expected: "one rule per meter, plan and condition set",
					actual: { rules: [other.id, rule.id], prices: [other.price_per_unit, rule.price_per_unit] },
					source: { kind: "assumed", reason: "Two equally specific rules for the same meter leave the price to row order." },
				});
			} else if (!other) {
				seen.set(dupKey, rule);
			}
		}
	}

	if (card.capability === "text.generate" && meters.has("input_text_tokens")) {
		const hasRead = meters.has("cached_read_text_tokens") || meters.has("implicit_cached_input_text_tokens");
		const writes = cacheWritesDocumented(card.providerId, card.apiModelId, hasRead);
		const hasWrite = [...meters].some((m) => m.startsWith("cached_write_text_tokens"));
		if (writes.documented && !hasWrite) {
			push("cache-write-missing", {
				kind: "dropped",
				path: "catalogue.cached_write_text_tokens",
				expected: "a cache-write price",
				actual: null,
				source: writes.source,
			});
		}
		if (!hasRead && (isClaude(card.apiModelId) || providerDocumentsCache(card.providerId).reads)) {
			push("cache-read-missing", {
				kind: "dropped",
				path: "catalogue.cached_read_text_tokens",
				expected: "a cache-read price",
				actual: null,
				source: isClaude(card.apiModelId) ? ANTHROPIC_PRICING : providerDocumentsCache(card.providerId).source,
				note: isClaude(card.apiModelId)
					? "Claude reports cache reads; without a price the engine throws pricing_rule_missing (AUDIT B1)"
					: "the provider documents cache-read usage fields provider-wide; whether this model returns them needs a live check. Without a price the engine throws pricing_rule_missing (AUDIT B1)",
			});
		}
	}
	return out;
}

/** A meter the card prices, left without a rule by one reachable condition branch (for example a long-context tier). */
export function conditionGap(card: SweepCard, caseId: string, meter: string, context: Record<string, unknown>): Mismatch {
	return {
		layer: "pricing",
		kind: "wrong_value",
		provider: card.providerId,
		family: family(card.capability),
		model: card.apiModelId,
		surface: card.capability,
		caseId: `catalogue:condition-gap.${meter}`,
		path: `catalogue.${meter}.match`,
		expected: "a rule for every condition branch the card prices other meters in",
		actual: { case: caseId, context },
		source: { kind: "assumed", reason: "When other meters of the card have a rule for this request, a meter with none is a gap in the card; the engine throws pricing_rule_missing for it." },
	};
}

/** Two condition branches for the same meter both match at a boundary value, at different prices. */
export function overlapMismatch(card: SweepCard, overlap: { ruleId: string; winnerId: string; meter: string; path: string; value: unknown }): Mismatch | null {
	const rule = card.rules.find((r) => String(r.id) === overlap.ruleId);
	const winner = card.rules.find((r) => String(r.id) === overlap.winnerId);
	if (!rule || !winner || perUnit(rule as any) === perUnit(winner as any)) return null;
	return {
		layer: "pricing",
		kind: "wrong_value",
		provider: card.providerId,
		family: family(card.capability),
		model: card.apiModelId,
		surface: card.capability,
		caseId: `catalogue:overlapping-conditions.${overlap.meter}`,
		path: `catalogue.${overlap.meter}.match`,
		expected: "condition branches that do not overlap",
		actual: { [overlap.path]: overlap.value, rules: [winner.id, rule.id], prices: [winner.price_per_unit, rule.price_per_unit], conditions: [winner.match, rule.match] },
		source: { kind: "assumed", reason: "At the boundary both tiers match, so the price depends on rule specificity rather than the provider's published threshold." },
	};
}

export function checkMissingCard(route: SweepRoute): Mismatch {
	return {
		layer: "pricing",
		kind: "dropped",
		provider: route.providerId,
		family: family(route.capability),
		model: route.apiModelId,
		surface: route.capability,
		caseId: "catalogue:no-card",
		path: "catalogue.card",
		expected: "a price card for an active route",
		actual: null,
		source: { kind: "assumed", reason: "An executed route with no card throws pricing_card_missing_for_executed_route (pipeline/after/pricing.ts), after the provider has been paid." },
	};
}
