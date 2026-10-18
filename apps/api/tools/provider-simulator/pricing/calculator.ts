// Purpose: Compute the expected cost of a usage payload from catalogue price rules, independently of the gateway engine.
// Why: The pricing sweep needs an oracle that does not share code (or bugs) with pipeline/pricing/engine.ts.
// How: Per meter, picks the matching rule for the requested plan (conditions, specificity, priority), applies the
//      documented fallbacks when a meter has no rule, and prices with exact decimal arithmetic (BigInt nanos,
//      half-up rounding once per rule and time window).

import type { Source } from "../src/expect/types";

export type CalcCondition = {
	path: string;
	op: string;
	value?: unknown;
	or_group?: number;
	and_index?: number;
};

export type CalcTimeWindow = {
	label?: string;
	timezone?: string;
	days_of_week?: string[];
	start_time: string;
	end_time: string;
	price_per_unit?: string | number | null;
	priority?: number | null;
};

export type CalcRule = {
	id: string;
	pricing_plan: string;
	meter: string;
	unit?: string;
	unit_size: number | string;
	price_per_unit: string | number;
	currency?: string;
	match?: CalcCondition[];
	priority?: number;
	included_quantity?: number;
	time_windows?: CalcTimeWindow[];
};

/**
 * Usage in non-overlapping semantic meters:
 * - `input_text_tokens` is uncached text input only; cache reads, writes and modality tokens are separate meters.
 * - `output_text_tokens` is visible text output only; `output_reasoning_tokens` is separate.
 * - `input_tokens`, `output_tokens`, `total_tokens` are aggregates (prompt length, completion length, sum). They are
 *   used for `input_tokens` conditions and are billed only where a card prices them directly.
 */
export type SemanticUsage = Record<string, number>;

export type CalcInput = {
	rules: CalcRule[];
	usage: SemanticUsage;
	/** Request and response attributes that rule `match` conditions read (cache_ttl, image_params.resolution, ...). */
	context: Record<string, unknown>;
	/** The plan the client asked for: standard, priority, fast, flex, ultrafast, batch or free. */
	plan: string;
	/** Request timestamp, for time-windowed prices. */
	timestampMs: number;
	/**
	 * Set for providers whose thinking-mode price covers the whole completion ("chain of thought + answer"): when the
	 * response has reasoning, the visible answer is billed at the reasoning price too. The value is the citation.
	 */
	thinkingModeBillsAnswer?: Source;
	/**
	 * Documented input multiplier for a cache write the card does not price (Claude 1.25 or 2 by TTL,
	 * OpenAI, Azure and Alibaba 1.25, otherwise 1). Without it an unpriced write costs 1x input.
	 */
	writeInputMultiplier?: (ttl: "5m" | "1h" | "any") => number;
};

export type ExpectedLine = {
	/** Semantic meter from the usage. */
	meter: string;
	quantity: number;
	/** Rule that priced it, or null when it is unpriced. */
	ruleId: string | null;
	/** Meter of the rule that priced it (differs from `meter` for fallbacks). */
	pricedAs: string | null;
	plan: string | null;
	nanos: number;
	/** Time window label, when a window price applied. */
	window?: string;
	fallback?: string;
	source?: Source;
};

export type ExpectedBill = {
	nanos: number;
	lines: ExpectedLine[];
	/** Meters with quantity and no price at all (not a charge, recorded for review). */
	unpriced: Array<{ meter: string; quantity: number; reason: string }>;
};

/** Plans a client can name. Anything else on a card is a provider SKU label that stands in for standard. */
export const REQUESTABLE_TIERS = new Set(["priority", "fast", "flex", "ultrafast", "batch", "free"]);

const PROMPT_CACHING_DOCS: Source = {
	kind: "gateway-docs",
	page: "apps/docs/v1/guides/prompt-caching.mdx",
	note: "\"Unsupported providers ignore cache hints or route without cached pricing\": a cache read with no cache price is billed as normal input.",
};

const OPENAI_REASONING_DOCS: Source = {
	kind: "docs",
	url: "https://developers.openai.com/api/docs/guides/reasoning",
	note: "Reasoning tokens \"are billed as output tokens\"; Gemini's pricing page likewise lists \"Output price (including thinking tokens)\".",
};

type Fallback = { meter: string; source: Source; label: string; multiplier?: number };

const WRITE_FALLBACK_DOCS: Source = {
	kind: "gateway-docs",
	page: "apps/docs/v1/guides/prompt-caching.mdx",
	note: "Without a cache-write price, writes bill at the input price times the provider's documented multiplier (pricing_fallback: input_rate).",
};

/** An unpriced cache write at the input price, times the documented multiplier when one is known. */
function writeAtInput(multiplier: number | undefined): Fallback {
	if (multiplier && multiplier !== 1) {
		return { meter: "input_text_tokens", label: `cache write at the input price x ${multiplier}`, source: WRITE_FALLBACK_DOCS, multiplier };
	}
	return { meter: "input_text_tokens", label: "cache write at the input price", source: WRITE_FALLBACK_DOCS };
}

function assumed(reason: string): Source {
	return { kind: "assumed", reason };
}

/** Where a meter's quantity is billed when the card has no rule for it, in order of preference. */
function fallbacksFor(meter: string, context: Record<string, unknown>, writeMultiplier?: CalcInput["writeInputMultiplier"]): Fallback[] {
	switch (meter) {
		case "cached_read_text_tokens":
			return [
				{ meter: "implicit_cached_input_text_tokens", label: "cache read at the implicit-cache price", source: assumed("A card that prices only implicit cache hits has one cache-read price; a reported read uses it.") },
				{ meter: "input_text_tokens", label: "cache read at the input price", source: PROMPT_CACHING_DOCS },
			];
		case "implicit_cached_input_text_tokens":
			return [
				{ meter: "cached_read_text_tokens", label: "implicit read at the cache-read price", source: assumed("Implicit and explicit cache hits are both cache reads; one cache-read price covers both.") },
				{ meter: "input_text_tokens", label: "implicit read at the input price", source: PROMPT_CACHING_DOCS },
			];
		case "cached_write_text_tokens_5m":
		case "cached_write_text_tokens_1h":
			return [
				{ meter: "cached_write_text_tokens", label: "TTL write at the single cache-write price", source: { kind: "gateway-docs", page: "apps/docs/v1/guides/prompt-caching.mdx", note: "cached_write_text_tokens is the meter \"when the provider has one cache-write price\"." } },
				writeAtInput(writeMultiplier?.(meter.endsWith("1h") ? "1h" : "5m")),
			];
		case "cached_write_text_tokens": {
			const ttl = String(context.cache_ttl ?? "").toLowerCase();
			const oneHour = ttl === "1h" || ttl === "60m" || ttl === "3600";
			const preferred = oneHour ? "cached_write_text_tokens_1h" : "cached_write_text_tokens_5m";
			return [
				{ meter: preferred, label: `write without a TTL split at the ${preferred.endsWith("1h") ? "1h" : "5m"} price`, source: assumed("A write with no TTL split takes the requested cache_control TTL, else the 5 minute default documented on the prompt caching page.") },
				writeAtInput(writeMultiplier?.(oneHour ? "1h" : ttl ? "5m" : "any")),
			];
		}
		case "output_reasoning_tokens":
			return [{ meter: "output_text_tokens", label: "reasoning at the output price", source: OPENAI_REASONING_DOCS }];
		case "input_image_tokens":
		case "input_audio_tokens":
		case "input_video_tokens":
			return [{ meter: "input_text_tokens", label: "modality input at the text input price", source: assumed("A card without a modality price charges every prompt token at the input price.") }];
		case "cached_read_image_tokens":
		case "cached_read_audio_tokens":
		case "cached_read_video_tokens": {
			const modality = meter.replace("cached_read_", "input_");
			return [
				{ meter: "cached_read_text_tokens", label: "modality cache read at the text cache-read price", source: assumed("Without a modality cache-read price, a cached modality token is a cache read.") },
				{ meter: modality, label: "modality cache read at the modality input price", source: PROMPT_CACHING_DOCS },
				{ meter: "input_text_tokens", label: "modality cache read at the text input price", source: PROMPT_CACHING_DOCS },
			];
		}
		case "output_image_tokens":
		case "output_audio_tokens":
		case "output_video_tokens":
			return [{ meter: "output_text_tokens", label: "modality output at the text output price", source: assumed("A card without a modality output price charges every completion token at the output price.") }];
		default:
			return [];
	}
}

// ---------------------------------------------------------------------------
// Conditions

function readPath(source: Record<string, unknown>, dotted: string): unknown {
	let cursor: any = source;
	for (const part of dotted.split(".")) {
		if (cursor == null || typeof cursor !== "object") return undefined;
		cursor = cursor[part];
	}
	return cursor;
}

export function conditionHolds(condition: CalcCondition, scope: Record<string, unknown>): boolean {
	const value = readPath(scope, condition.path);
	const target = condition.value;
	switch (condition.op) {
		case "exists": return value !== undefined;
		case "not_exists": return value === undefined;
		case "eq": return value === target;
		case "ne": return value !== target;
		case "lt": return typeof value === "number" && value < Number(target);
		case "lte": return typeof value === "number" && value <= Number(target);
		case "gt": return typeof value === "number" && value > Number(target);
		case "gte": return typeof value === "number" && value >= Number(target);
		case "in": return Array.isArray(target) && target.includes(value);
		case "not_in": return Array.isArray(target) && !target.includes(value);
		case "starts_with": return typeof value === "string" && typeof target === "string" && value.startsWith(target);
		case "regex": {
			try {
				return typeof value === "string" && new RegExp(String(target)).test(value);
			} catch {
				return false;
			}
		}
		default: return false;
	}
}

/** Groups of conditions: OR across `or_group`, AND inside a group. Without groups, every condition must hold. */
export function conditionGroups(match: CalcCondition[] | undefined): CalcCondition[][] {
	const list = match ?? [];
	if (!list.length) return [];
	if (!list.some((c) => typeof c.or_group === "number")) return [list];
	const groups = new Map<number, CalcCondition[]>();
	for (const condition of list) {
		const key = typeof condition.or_group === "number" ? condition.or_group : 1;
		groups.set(key, [...(groups.get(key) ?? []), condition]);
	}
	return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, group]) => group);
}

/** Size of the most specific satisfied group, or -1 when the rule does not apply. 0 for unconditional rules. */
export function ruleSpecificity(rule: CalcRule, scope: Record<string, unknown>): number {
	const groups = conditionGroups(rule.match);
	if (!groups.length) return 0;
	let best = -1;
	for (const group of groups) {
		if (group.every((condition) => conditionHolds(condition, scope))) best = Math.max(best, group.length);
	}
	return best;
}

// ---------------------------------------------------------------------------
// Exact money

const TEN = 10n;

/** Parses a decimal (or exponent) price into an exact fraction of USD: value = num / den. */
export function parseDecimal(raw: string | number): { num: bigint; den: bigint } {
	let text = typeof raw === "number" ? String(raw) : String(raw).trim();
	if (!text) return { num: 0n, den: 1n };
	let negative = false;
	if (text.startsWith("-")) {
		negative = true;
		text = text.slice(1);
	}
	let exponent = 0;
	const expMatch = text.match(/^(.*)[eE]([+-]?\d+)$/);
	if (expMatch) {
		text = expMatch[1];
		exponent = Number(expMatch[2]);
	}
	const [whole, frac = ""] = text.split(".");
	let num = BigInt((whole || "0") + frac);
	let scale = frac.length - exponent;
	if (scale < 0) {
		num *= TEN ** BigInt(-scale);
		scale = 0;
	}
	return { num: negative ? -num : num, den: TEN ** BigInt(scale) };
}

/** Rounds num/den to the nearest integer, halves away from zero (all billing quantities are non-negative). */
function roundHalfUp(num: bigint, den: bigint): bigint {
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const q = num / den;
	const r = num % den;
	return 2n * (r < 0n ? -r : r) >= den ? q + (num < 0n ? -1n : 1n) : q;
}

/** Exact line cost in nanos: quantity / unit_size × price, rounded once. */
export function lineNanos(quantity: number, unitSize: number | string, price: string | number): number {
	const qty = parseDecimal(Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(9));
	const unit = parseDecimal(unitSize);
	const usd = parseDecimal(price);
	if (unit.num <= 0n) throw new Error("calculator: unit_size must be positive");
	const num = qty.num * usd.num * 1_000_000_000n * unit.den;
	const den = qty.den * usd.den * unit.num;
	return Number(roundHalfUp(num, den));
}

// ---------------------------------------------------------------------------
// Time windows

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function minuteOf(text: string): number | null {
	const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text ?? "");
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function activeWindow(rule: CalcRule, timestampMs: number): CalcTimeWindow | null {
	const windows = rule.time_windows ?? [];
	if (!windows.length || !Number.isFinite(timestampMs)) return null;
	const date = new Date(timestampMs);
	const minute = date.getUTCHours() * 60 + date.getUTCMinutes();
	const day = DAY_KEYS[date.getUTCDay()];
	const inside = windows
		.map((window, index) => ({ window, index }))
		.filter(({ window }) => {
			if ((window.timezone ?? "UTC") !== "UTC") return false;
			if (window.days_of_week?.length && !window.days_of_week.includes(day)) return false;
			const start = minuteOf(window.start_time);
			const end = minuteOf(window.end_time);
			if (start === null || end === null || start === end) return false;
			return start < end ? minute >= start && minute < end : minute >= start || minute < end;
		})
		.sort((a, b) => Number(b.window.priority ?? 0) - Number(a.window.priority ?? 0) || a.index - b.index);
	const chosen = inside[0]?.window;
	return chosen && chosen.price_per_unit !== undefined && chosen.price_per_unit !== null ? chosen : null;
}

// ---------------------------------------------------------------------------
// Rule selection

function plansMatching(requested: string): string[] {
	if (requested === "priority" || requested === "fast") return ["priority", "fast"];
	return [requested];
}

/** Plans whose rules apply to a request for `requested`, most preferred first. */
export function planChain(rules: CalcRule[], requested: string): string[] {
	const present = new Set(rules.map((rule) => rule.pricing_plan));
	const chain: string[][] = [plansMatching(requested)];
	if (requested !== "standard") chain.push(["standard"]);
	if (!present.has("standard")) {
		// A card with no standard rules sells its default SKU under a provider label (default, early_access, ...).
		const labels = [...present].filter((plan) => !REQUESTABLE_TIERS.has(plan)).sort();
		if (labels.length) chain.push(labels);
		// A card that sells exactly one tier is that route's price whatever the request names.
		if (present.size === 1) chain.push([...present]);
	}
	const out: string[] = [];
	for (const group of chain) for (const plan of group) if (present.has(plan) && !out.includes(plan)) out.push(plan);
	return out;
}

export function selectRule(rules: CalcRule[], meter: string, plans: string[], scope: Record<string, unknown>): CalcRule | null {
	for (const plan of plans) {
		const scored = rules
			.map((rule, index) => ({ rule, index, specificity: rule.pricing_plan === plan && rule.meter === meter ? ruleSpecificity(rule, scope) : -1 }))
			.filter((entry) => entry.specificity >= 0)
			.sort((a, b) => b.specificity - a.specificity || Number(b.rule.priority ?? 100) - Number(a.rule.priority ?? 100) || a.index - b.index);
		if (scored.length) return scored[0].rule;
	}
	return null;
}

// ---------------------------------------------------------------------------
// Bill

export function expectedBill(input: CalcInput): ExpectedBill {
	const { rules, usage, context, plan, timestampMs, thinkingModeBillsAnswer, writeInputMultiplier } = input;
	const scope: Record<string, unknown> = { ...context, ...usage };
	const plans = planChain(rules, plan);
	type Pending = { meter: string; quantity: number; rule: CalcRule | null; fallback?: Fallback };
	const pending: Pending[] = [];
	const unpriced: ExpectedBill["unpriced"] = [];

	for (const [meter, quantity] of Object.entries(usage).sort(([a], [b]) => a.localeCompare(b))) {
		if (!(typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0)) continue;
		if (meter === "output_text_tokens" && thinkingModeBillsAnswer && (usage.output_reasoning_tokens ?? 0) > 0) {
			const thinking = selectRule(rules, "output_reasoning_tokens", plans, scope);
			if (thinking) {
				pending.push({ meter, quantity, rule: thinking, fallback: { meter: "output_reasoning_tokens", label: "answer billed at the thinking-mode price", source: thinkingModeBillsAnswer } });
				continue;
			}
		}
		const direct = selectRule(rules, meter, plans, scope);
		if (direct) {
			pending.push({ meter, quantity, rule: direct });
			continue;
		}
		let placed = false;
		for (const fallback of fallbacksFor(meter, context, writeInputMultiplier)) {
			const rule = selectRule(rules, fallback.meter, plans, scope);
			if (rule) {
				pending.push({ meter, quantity, rule, fallback });
				placed = true;
				break;
			}
		}
		if (!placed) unpriced.push({ meter, quantity, reason: fallbacksFor(meter, context).length ? "no rule for the meter or its fallbacks" : "the card does not price this meter" });
	}

	// Round once per rule and price window, the way a provider invoice line is computed.
	const groups = new Map<string, { rule: CalcRule; window: CalcTimeWindow | null; multiplier: number; quantity: number; members: Pending[] }>();
	for (const entry of pending) {
		const rule = entry.rule!;
		const window = activeWindow(rule, timestampMs);
		const multiplier = entry.fallback?.multiplier ?? 1;
		const key = `${rule.id}|${window?.label ?? ""}|${multiplier}`;
		const group = groups.get(key) ?? { rule, window, multiplier, quantity: 0, members: [] };
		group.quantity += entry.quantity;
		group.members.push(entry);
		groups.set(key, group);
	}

	const lines: ExpectedLine[] = [];
	let total = 0;
	for (const group of groups.values()) {
		const included = Math.max(0, Number(group.rule.included_quantity ?? 0));
		const price = group.window?.price_per_unit ?? group.rule.price_per_unit;
		const billable = Math.max(0, group.quantity - included);
		// A documented fallback multiplier (unpriced cache writes) scales the quantity priced at the input rate.
		const groupNanos = lineNanos(billable * group.multiplier, group.rule.unit_size, price);
		total += groupNanos;
		// Split the group's cost over its members by quantity; the remainder goes to the first member.
		let assigned = 0;
		group.members.forEach((member, index) => {
			const share = index === group.members.length - 1
				? groupNanos - assigned
				: Math.round(groupNanos * (member.quantity / Math.max(1, group.quantity)));
			assigned += share;
			lines.push({
				meter: member.meter,
				quantity: member.quantity,
				ruleId: group.rule.id,
				pricedAs: group.rule.meter,
				plan: group.rule.pricing_plan,
				nanos: share,
				...(group.window?.label ? { window: group.window.label } : {}),
				...(member.fallback ? { fallback: member.fallback.label, source: member.fallback.source } : {}),
			});
		});
	}
	lines.sort((a, b) => a.meter.localeCompare(b.meter));
	return { nanos: total, lines, unpriced };
}
