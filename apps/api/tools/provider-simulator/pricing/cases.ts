// Purpose: Build the pricing cases for one price card: every rule, plan, condition branch and time window, plus fallback
//          cases and one "documented usage" case per route.
// Why: Coverage has to be complete and reviewable, so cases are derived from the card's own rules rather than sampled.
// How: Each rule gets a case that requests its plan, satisfies one of its condition groups (boundary values for numeric
//      thresholds) and carries its meter with a distinct quantity. Cases with the same inputs are merged. Text cards add
//      cache-write fallbacks and a documented case shaped as the gateway's IR usage.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CalcCondition, CalcRule, SemanticUsage } from "./calculator";
import { conditionGroups, planChain, REQUESTABLE_TIERS, selectRule } from "./calculator";
import type { SweepCard, SweepRoute } from "./catalogue-cards";
import { SWEEP_NOW_MS } from "./catalogue-cards";
import type { Source } from "../src/expect/types";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIM_ROOT = path.resolve(here, "..");

export type CaseKind = "rule" | "window" | "fallback" | "documented";

export type PricingCase = {
	id: string;
	kind: CaseKind;
	/** Rule ids this case was built to exercise. */
	targets: string[];
	/** Plan the client requests (standard, priority, fast, flex, ultrafast, batch, free). */
	plan: string;
	/** Request body fields that pricing reads (model, service_tier, cache_control). */
	body: Record<string, unknown>;
	/** Attributes rule conditions read; handed to the engine as usage.context. */
	context: Record<string, unknown>;
	/** Semantic usage (see calculator.ts). */
	usage: SemanticUsage;
	timestampMs: number;
	/** Semantic meters the provider reports under another engine key (e.g. a TTL write reported without its TTL). */
	reportAs?: Record<string, string>;
	/** Documented case: the IR usage handed to normalizeTextUsageForPricing instead of explicit meters. */
	irUsage?: Record<string, unknown>;
	dialect?: string;
	notes?: string[];
	/** Source for the case's premise, when it is not simply "the card's own rule". */
	source?: Source;
};

// ---------------------------------------------------------------------------
// Quantities. Distinct values so a meter billed under the wrong rule is visible.

const TOKEN_QTY: Record<string, number> = {
	input_text_tokens: 12_347,
	output_text_tokens: 3_457,
	output_reasoning_tokens: 789,
	cached_read_text_tokens: 4_567,
	implicit_cached_input_text_tokens: 4_567,
	cached_write_text_tokens: 987,
	cached_write_text_tokens_5m: 2_345,
	cached_write_text_tokens_1h: 1_234,
	input_image_tokens: 1_543,
	input_audio_tokens: 1_721,
	input_video_tokens: 1_907,
	output_image_tokens: 1_291,
	output_audio_tokens: 1_433,
	output_video_tokens: 1_601,
	cached_read_image_tokens: 211,
	cached_read_audio_tokens: 223,
	cached_read_video_tokens: 227,
	cached_write_image_tokens: 229,
	cached_write_audio_tokens: 233,
	cached_write_video_tokens: 239,
	embedding_tokens: 5_003,
};

const UNIT_QTY: Record<string, number> = {
	output_image: 2,
	input_image: 3,
	output_video: 1,
	output_video_seconds: 7,
	input_video_seconds: 9,
	input_audio_seconds: 61,
	output_audio_seconds: 13,
	audio_seconds: 61,
	input_audio_minutes: 3,
	output_audio_minutes: 2,
	audio_minutes: 3,
	input_characters: 1_234,
	input_text_bytes: 4_567,
	input_pages: 3,
	input_text_messages: 3,
	output_video_frames: 121,
	bfl_credits: 5,
	deepinfra_cost_usd: 0.0123,
	image_pixels: 1_048_576,
	video_pixels: 2_073_600,
	requests: 1,
	native_web_search_requests: 2,
	native_web_fetch_requests: 1,
	server_tool_web_search_requests: 2,
	server_tool_web_search_extra_results: 3,
	server_tool_web_fetch_requests: 1,
	server_tool_advisor_requests: 1,
	server_tool_image_generation_requests: 1,
	server_tool_apply_patch_requests: 1,
};

const AGGREGATES = new Set(["input_tokens", "output_tokens", "total_tokens"]);

const INPUT_PARTS = [
	"input_text_tokens", "cached_read_text_tokens", "implicit_cached_input_text_tokens",
	"cached_write_text_tokens", "cached_write_text_tokens_5m", "cached_write_text_tokens_1h",
	"input_image_tokens", "input_audio_tokens", "input_video_tokens",
	"cached_read_image_tokens", "cached_read_audio_tokens", "cached_read_video_tokens",
	"cached_write_image_tokens", "cached_write_audio_tokens", "cached_write_video_tokens",
];
const OUTPUT_PARTS = ["output_text_tokens", "output_reasoning_tokens", "output_image_tokens", "output_audio_tokens", "output_video_tokens"];

export function quantityFor(meter: string): number {
	return TOKEN_QTY[meter] ?? UNIT_QTY[meter] ?? (/tokens$/.test(meter) ? 1_009 : 1);
}

export function isTokenMeter(meter: string): boolean {
	return /tokens(_5m|_1h)?$/.test(meter);
}

/** Card has token-priced rules, so a request also carries input and output token counts. */
function cardIsTokenPriced(card: SweepCard): boolean {
	return card.rules.some((rule) => isTokenMeter(rule.meter) && !AGGREGATES.has(rule.meter) && rule.meter !== "embedding_tokens") ||
		card.rules.some((rule) => rule.meter === "input_tokens" || rule.meter === "output_tokens");
}

// ---------------------------------------------------------------------------
// Conditions

/** Accepts the catalogue's alternate condition spellings ({field|key, operator}) that some fixtures use. */
export function normaliseCondition(condition: Record<string, any>): CalcCondition {
	return {
		path: condition.path ?? condition.field ?? condition.key,
		op: condition.op ?? condition.operator,
		value: condition.value,
		...(typeof condition.or_group === "number" ? { or_group: condition.or_group } : {}),
	};
}

export function calcRules(card: SweepCard): CalcRule[] {
	return card.rules.map((rule) => ({
		id: String(rule.id),
		pricing_plan: rule.pricing_plan,
		meter: rule.meter,
		unit: rule.unit,
		unit_size: rule.unit_size,
		price_per_unit: rule.price_per_unit,
		currency: rule.currency,
		match: (rule.match ?? []).map((condition: any) => normaliseCondition(condition)),
		priority: rule.priority,
		included_quantity: rule.included_quantity,
		time_windows: (rule.time_windows ?? []) as any,
	}));
}

function setPath(target: Record<string, any>, dotted: string, value: unknown) {
	const parts = dotted.split(".");
	let cursor = target;
	for (const part of parts.slice(0, -1)) {
		if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
		cursor = cursor[part];
	}
	cursor[parts[parts.length - 1]] = value;
}

type Solved = { values: Map<string, unknown>; unsolvable?: string };

function conditionAccepts(condition: CalcCondition, value: number): boolean {
	const n = Number(condition.value);
	switch (condition.op) {
		case "gt": return value > n;
		case "gte": return value >= n;
		case "lt": return value < n;
		case "lte": return value <= n;
		case "eq": return value === condition.value;
		default: return true;
	}
}

/** Picks values that satisfy one AND-group. Numeric bounds take the boundary value (lte X → X, gt X → X + 1). */
export function solveGroup(group: CalcCondition[]): Solved {
	const values = new Map<string, unknown>();
	const bounds = new Map<string, { lo?: number; hi?: number }>();
	for (const condition of group) {
		const { path: p, op, value } = condition;
		if (!p) return { values, unsolvable: "condition without a path" };
		switch (op) {
			case "eq": values.set(p, value); break;
			case "in": if (Array.isArray(value) && value.length) values.set(p, value[0]); else return { values, unsolvable: `${p} in []` }; break;
			case "ne": if (!values.has(p)) values.set(p, typeof value === "number" ? value + 1 : typeof value === "boolean" ? !value : `${String(value)}-sim-other`); break;
			case "not_in": if (!values.has(p)) values.set(p, "sim-other"); break;
			case "exists": if (!values.has(p)) values.set(p, "sim-present"); break;
			case "not_exists": values.set(p, undefined); break;
			case "starts_with": values.set(p, `${String(value)}-sim`); break;
			case "gt": case "gte": case "lt": case "lte": {
				const n = Number(value);
				const b = bounds.get(p) ?? {};
				if (op === "gt") b.lo = Math.max(b.lo ?? -Infinity, Number.isInteger(n) ? n + 1 : n + 0.5);
				if (op === "gte") b.lo = Math.max(b.lo ?? -Infinity, n);
				if (op === "lt") b.hi = Math.min(b.hi ?? Infinity, Number.isInteger(n) ? n - 1 : n - 0.5);
				if (op === "lte") b.hi = Math.min(b.hi ?? Infinity, n);
				bounds.set(p, b);
				break;
			}
			default: return { values, unsolvable: `unsupported operator ${op}` };
		}
	}
	for (const [p, b] of bounds) {
		if (b.lo !== undefined && b.hi !== undefined && b.lo > b.hi) return { values, unsolvable: `${p} bounds conflict` };
		values.set(p, b.hi !== undefined && Number.isFinite(b.hi) ? Math.max(0, b.hi) : Math.max(0, b.lo ?? 0));
	}
	return { values };
}

// ---------------------------------------------------------------------------
// Plans

/** How a client asks for a rule's plan, or null when the plan cannot be requested on this card. */
function requestForPlan(plan: string, card: SweepCard): { plan: string; body: Record<string, unknown> } | null {
	const hasStandard = card.rules.some((rule) => rule.pricing_plan === "standard");
	const model = card.apiModelId;
	if (plan === "standard") return { plan: "standard", body: { model } };
	if (plan === "free") return model.endsWith(":free") ? { plan: "free", body: { model } } : hasStandard ? null : { plan: "standard", body: { model } };
	if (REQUESTABLE_TIERS.has(plan)) return { plan, body: { model, service_tier: plan } };
	// Provider SKU labels (default, early_access, upstream-1, ...) stand in for standard only when there is no standard.
	return hasStandard ? null : { plan: model.endsWith(":free") ? "free" : "standard", body: { model } };
}

// ---------------------------------------------------------------------------
// Usage assembly

function baseUsage(card: SweepCard, route: SweepRoute | null): SemanticUsage {
	const usage: SemanticUsage = { requests: 1 };
	if (cardIsTokenPriced(card)) {
		usage.input_text_tokens = TOKEN_QTY.input_text_tokens;
		usage.output_text_tokens = TOKEN_QTY.output_text_tokens;
		if (card.capability === "text.generate" && route?.reasoning) usage.output_reasoning_tokens = TOKEN_QTY.output_reasoning_tokens;
	}
	// A speech request always returns audio; calculatePricing rejects speech usage without it when audio is priced.
	if (card.capability === "audio.speech" && card.rules.some((rule) => rule.meter === "output_audio_tokens")) {
		usage.output_audio_tokens = TOKEN_QTY.output_audio_tokens;
	}
	return usage;
}

/** Fills the aggregate meters from the parts. A fixed prompt length (from an input_tokens condition) rebalances input_text_tokens. */
function finaliseUsage(usage: SemanticUsage, card: SweepCard, promptLength?: number) {
	const tokenPriced = cardIsTokenPriced(card);
	if (!tokenPriced && promptLength === undefined) return;
	if (promptLength !== undefined) {
		const others = INPUT_PARTS.filter((m) => m !== "input_text_tokens").reduce((sum, m) => sum + (usage[m] ?? 0), 0);
		if (promptLength - others >= 1) {
			usage.input_text_tokens = promptLength - others;
		} else {
			// The target is below the cache and modality parts: keep the targeted meters, drop the others.
			for (const m of INPUT_PARTS) if (m !== "input_text_tokens") delete usage[m];
			usage.input_text_tokens = Math.max(0, promptLength);
		}
	}
	usage.input_tokens = INPUT_PARTS.reduce((sum, m) => sum + (usage[m] ?? 0), 0);
	usage.output_tokens = OUTPUT_PARTS.reduce((sum, m) => sum + (usage[m] ?? 0), 0);
	usage.total_tokens = usage.input_tokens + usage.output_tokens;
}

function cacheTtlFor(meter: string): string | undefined {
	if (meter === "cached_write_text_tokens_5m") return "5m";
	if (meter === "cached_write_text_tokens_1h") return "1h";
	return undefined;
}

function signature(entry: Pick<PricingCase, "plan" | "body" | "context" | "usage" | "timestampMs" | "reportAs" | "irUsage">): string {
	return JSON.stringify([entry.plan, entry.body, entry.context, Object.entries(entry.usage).sort(), entry.timestampMs, entry.reportAs ?? null, entry.irUsage ?? null]);
}

/** A timestamp inside a UTC time window, in the week of the sweep's clock. */
function timestampInside(window: { days_of_week?: string[]; start_time: string }): number {
	const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
	const [hh, mm] = window.start_time.split(":").map(Number);
	const base = new Date(SWEEP_NOW_MS);
	for (let offset = 0; offset < 7; offset += 1) {
		const day = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - offset, hh, mm));
		if (!window.days_of_week?.length || window.days_of_week.includes(days[day.getUTCDay()])) return day.getTime();
	}
	return SWEEP_NOW_MS;
}

// ---------------------------------------------------------------------------
// Provider facts used by fallback and documented cases

let summaryDialects: Map<string, string[]> | null = null;

function providerDialects(providerId: string): string[] {
	if (!summaryDialects) {
		summaryDialects = new Map();
		const file = path.join(SIM_ROOT, "results", "summary.json");
		if (fs.existsSync(file)) {
			for (const entry of JSON.parse(fs.readFileSync(file, "utf8")).providers ?? []) {
				summaryDialects.set(entry.providerId, (entry.dialects ?? []).filter((d: string) => d !== "unknown"));
			}
		}
	}
	return summaryDialects.get(providerId) ?? [];
}

/** Same family split as src/providers.ts (copied: that module loads every executor). */
function modelFamily(apiModelId: string): "claude" | "gemini" | "openai" | "other" {
	const id = apiModelId.toLowerCase();
	if (/claude|anthropic\//.test(id)) return "claude";
	if (/gemini|google\/gemma/.test(id)) return "gemini";
	if (/^openai\/|\bgpt-|\/o[134]\b|\bo[134]-/.test(id)) return "openai";
	return "other";
}

export function routeDialect(providerId: string, apiModelId: string): string {
	const dialects = providerDialects(providerId);
	const family = modelFamily(apiModelId);
	if (family === "claude" && dialects.includes("anthropic-messages")) return "anthropic-messages";
	if (family === "claude" && /^anthropic/.test(providerId)) return "anthropic-messages";
	if (family === "gemini" && dialects.includes("gemini")) return "gemini";
	if (dialects.includes("gemini-interactions")) return "gemini-interactions";
	return dialects.find((d) => d.startsWith("openai")) ?? dialects[0] ?? "openai-chat";
}

let manifest: any = null;
const specCacheMentions = new Map<string, { reads: boolean; writes: boolean }>();

/** Whether the provider's own spec or API reference documents cache-read and cache-write usage fields. */
export function providerDocumentsCache(providerId: string): { reads: boolean; writes: boolean; source: Source } {
	if (!manifest) {
		const file = path.join(SIM_ROOT, "specs", "manifest.json");
		manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { providers: {} };
	}
	const entry = manifest.providers?.[providerId];
	if (!entry) return { reads: false, writes: false, source: { kind: "assumed", reason: "no spec or API reference recorded for this provider" } };
	const fields: string[] = entry.usageFields ?? [];
	let reads = fields.some((f) => /cache|cached/i.test(f) && !/creation|write/i.test(f));
	const writes = fields.some((f) => /creation|cache_write/i.test(f));
	if (entry.kind === "own") {
		if (!specCacheMentions.has(entry.spec)) {
			const file = path.join(SIM_ROOT, "specs", `${entry.spec}.json`);
			const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
			specCacheMentions.set(entry.spec, {
				reads: /cached_tokens|cache_read_input_tokens|cachedContentTokenCount|prompt_cache_hit_tokens/.test(text),
				writes: /cache_creation_input_tokens|cache_write_tokens/.test(text),
			});
		}
		// Only reads are taken from whole specs: OpenAI's spec documents cache_write_tokens, but only GPT-5.6 and later
		// report them, so a provider-wide "writes" flag would be wrong for most of its models.
		reads ||= specCacheMentions.get(entry.spec)!.reads;
	}
	return {
		reads,
		writes,
		source: entry.kind === "baseline"
			? { kind: "assumed", reason: "only the OpenAI baseline schema is recorded for this provider" }
			: { kind: "spec", spec: entry.spec, path: entry.kind === "own" ? "usage schema" : "usageFields" },
	};
}

/** Hosts that sell Claude at Anthropic's documented cache-write prices (first party and the hyperscalers). */
const CLAUDE_CACHE_HOSTS = /^(anthropic|amazon-bedrock|google-vertex|azure)/;

/**
 * Whether a route's provider documents cache writes for this model, and where. Outside Claude, a provider-wide usage
 * field only counts for models whose card prices cache reads (models without prompt caching never report writes).
 */
export function cacheWritesDocumented(providerId: string, apiModelId: string, pricesCacheReads = true): { documented: boolean; source: Source } {
	if (modelFamily(apiModelId) === "claude" && CLAUDE_CACHE_HOSTS.test(providerId)) {
		return { documented: true, source: { kind: "docs", url: "https://platform.claude.com/docs/en/about-claude/pricing#prompt-caching", note: "5-minute cache write 1.25x base input; 1-hour 2x. Partner platforms (Bedrock, Google Cloud) set their own prices." } };
	}
	const documents = providerDocumentsCache(providerId);
	return { documented: documents.writes && pricesCacheReads, source: documents.source };
}

// ---------------------------------------------------------------------------
// Documented usage

/** A typical response for the route, as the provider documents its usage, mapped to the gateway's IR usage. */
function documentedTextCase(card: SweepCard, route: SweepRoute | null, extra: { promptLength?: number; unpricedRead?: boolean } = {}): PricingCase {
	const dialect = routeDialect(card.providerId, card.apiModelId);
	const documents = providerDocumentsCache(card.providerId);
	const priced = new Set(card.rules.map((rule) => rule.meter));
	const pricesRead = priced.has("cached_read_text_tokens") || priced.has("implicit_cached_input_text_tokens");
	const pricesWrite = [...priced].some((m) => m.startsWith("cached_write_text_tokens"));
	const anthropicLike = dialect === "anthropic-messages";
	const geminiLike = dialect === "gemini" || dialect === "gemini-interactions";
	// Claude and Gemini usage always carries cache reads. Elsewhere a typical response only has them when the model
	// supports caching, which the card's cache-read price is the best offline evidence of; the unpriced-read variant
	// (extra.unpricedRead) covers providers that document reads provider-wide.
	const reportsRead = pricesRead || anthropicLike || geminiLike || extra.unpricedRead === true;
	const reportsWrite = anthropicLike && (pricesWrite || cacheWritesDocumented(card.providerId, card.apiModelId, pricesRead).documented);
	const reasoning = route?.reasoning === true;

	const total = extra.promptLength ?? 2_600;
	const read = reportsRead ? (extra.promptLength ? Math.max(0, total - 20_000) : 1_024) : 0;
	const write5m = reportsWrite ? (extra.promptLength ? 10_001 : 512) : 0;
	const uncached = Math.max(1, total - read - write5m);
	const reasoningTokens = reasoning ? 192 : 0;
	const visible = 448;

	const usage: SemanticUsage = { requests: 1, input_text_tokens: uncached, output_text_tokens: visible };
	if (read) usage.cached_read_text_tokens = read;
	if (write5m) usage.cached_write_text_tokens_5m = write5m;
	if (reasoningTokens) usage.output_reasoning_tokens = reasoningTokens;
	finaliseUsage(usage, card);

	// IR contract (core/ir.ts IRUsage): inputTokens counts cache reads (flagged as a subset); writes travel in _ext.
	const ir: Record<string, unknown> = {
		inputTokens: uncached + read,
		outputTokens: visible + reasoningTokens,
		totalTokens: uncached + read + visible + reasoningTokens,
	};
	if (read) {
		ir.cachedInputTokens = read;
		ir.cachedReadTokensAreSubsetOfInput = true;
	}
	if (reasoningTokens) ir.reasoningTokens = reasoningTokens;
	if (write5m) ir._ext = { cachedWriteTokens: write5m, cachedWriteTokens5m: write5m };

	const notes = [
		`dialect ${dialect}; cache read ${reportsRead ? "reported" : "not reported"}${reportsRead && !pricesRead ? " (provider documents it, card has no cache-read price)" : ""}`,
		"IR usage: inputTokens includes cache reads (cachedReadTokensAreSubsetOfInput); cache writes are in _ext, outside inputTokens; outputTokens includes reasoning.",
	];
	if (extra.promptLength) notes.push(`prompt length ${extra.promptLength} counts cache reads and writes (Anthropic: \"A request's prompt length counts all of its input tokens, including cache reads and cache writes\").`);
	return {
		id: extra.unpricedRead ? "fallback.cache-read.no-rule" : extra.promptLength ? `documented.long-context@${extra.promptLength}` : "documented",
		kind: extra.unpricedRead ? "fallback" : "documented",
		targets: [],
		plan: card.apiModelId.endsWith(":free") ? "free" : "standard",
		body: { model: card.apiModelId, ...(write5m ? { cache_control: { type: "ephemeral", ttl: "5m" } } : {}) },
		context: {},
		usage,
		timestampMs: SWEEP_NOW_MS,
		irUsage: ir,
		dialect,
		notes,
		source: extra.promptLength
			? { kind: "docs", url: "https://platform.claude.com/docs/en/about-claude/pricing#long-context-pricing", note: "Long-context thresholds count cache reads and writes." }
			: reportsRead && !pricesRead ? documents.source : undefined,
	};
}

/** A typical request for a non-text card: the default plan's meters, typical quantities, the first condition branch. */
function documentedMediaCase(card: SweepCard, rules: CalcRule[]): PricingCase {
	const request = requestForPlan("standard", card) ?? { plan: "standard", body: { model: card.apiModelId } };
	const plansPresent = new Set(rules.map((r) => r.pricing_plan));
	const plan = plansPresent.has("standard") ? "standard" : [...plansPresent].sort()[0];
	const planRules = rules.filter((r) => r.pricing_plan === plan);
	const usage: SemanticUsage = { requests: 1 };
	const context: Record<string, any> = {};
	const firstConditional = planRules.find((r) => (r.match ?? []).length);
	let promptLength: number | undefined;
	if (firstConditional) {
		const solved = solveGroup(conditionGroups(firstConditional.match)[0] ?? []);
		for (const [p, v] of solved.values) {
			if (p === "input_tokens") promptLength = Number(v);
			else if (quantityFor(p) && (TOKEN_QTY[p] !== undefined || UNIT_QTY[p] !== undefined)) usage[p] = Number(v);
			else if (v !== undefined) setPath(context, p, v);
		}
	}
	for (const rule of planRules) {
		if (AGGREGATES.has(rule.meter) && cardIsTokenPriced(card)) continue;
		if (usage[rule.meter] !== undefined) continue;
		usage[rule.meter] = isTokenMeter(rule.meter) ? 1_000 : typicalUnits(rule.meter);
	}
	finaliseUsage(usage, card, promptLength);
	return {
		id: "documented",
		kind: "documented",
		targets: [],
		plan: request.plan,
		body: request.body,
		context,
		usage,
		timestampMs: SWEEP_NOW_MS,
		notes: ["typical request: the default plan's meters with typical quantities and the first condition branch"],
	};
}

function typicalUnits(meter: string): number {
	if (/video_seconds/.test(meter)) return 5;
	if (/audio_seconds|^audio_seconds/.test(meter)) return 60;
	if (/minutes/.test(meter)) return 1;
	if (/characters/.test(meter)) return 1_000;
	if (/bytes/.test(meter)) return 1_000;
	if (/pixels/.test(meter)) return 1_048_576;
	if (/frames/.test(meter)) return 120;
	if (meter === "deepinfra_cost_usd") return 0.01;
	return 1;
}

// ---------------------------------------------------------------------------
// Case generation

export type CaseSet = {
	cases: PricingCase[];
	unreachable: Array<{ ruleId: string; reason: string }>;
	/** Condition branches that overlap: at the boundary value another rule for the same meter wins. */
	overlaps: Array<{ ruleId: string; winnerId: string; meter: string; path: string; value: unknown }>;
};

export function buildCases(card: SweepCard, route: SweepRoute | null): CaseSet {
	const rules = calcRules(card);
	const cases = new Map<string, PricingCase>();
	const unreachable: CaseSet["unreachable"] = [];
	const overlaps: CaseSet["overlaps"] = [];
	const add = (entry: PricingCase) => {
		const key = signature(entry);
		const existing = cases.get(key);
		if (existing) {
			for (const target of entry.targets) if (!existing.targets.includes(target)) existing.targets.push(target);
			return;
		}
		cases.set(key, entry);
	};

	// A rule with the same plan, meter and conditions as an earlier rule in the card's order (priority first) can never
	// be selected. Promotional rows layered over list prices look like this; report them rather than target them.
	const firstBySignature = new Map<string, CalcRule>();
	const shadowed = new Set<string>();
	for (const rule of rules) {
		const key = `${rule.pricing_plan}|${rule.meter}|${JSON.stringify(rule.match ?? [])}`;
		const winner = firstBySignature.get(key);
		if (!winner) firstBySignature.set(key, rule);
		else {
			shadowed.add(rule.id);
			unreachable.push({ ruleId: rule.id, reason: `shadowed by ${winner.id} (same plan, meter and conditions; priority ${winner.priority ?? 100} vs ${rule.priority ?? 100}${winner.price_per_unit === rule.price_per_unit ? ", same price" : `, price ${winner.price_per_unit} vs ${rule.price_per_unit}`})` });
		}
	}

	for (const rule of rules) {
		if (shadowed.has(rule.id)) continue;
		const request = requestForPlan(rule.pricing_plan, card);
		if (!request) {
			unreachable.push({ ruleId: rule.id, reason: `plan "${rule.pricing_plan}" cannot be requested on a card that also has standard rules` });
			continue;
		}
		const groups = conditionGroups(rule.match);
		const groupList = groups.length ? groups : [[]];
		groupList.forEach((group, groupIndex) => {
			const solved = solveGroup(group);
			if (solved.unsolvable) {
				unreachable.push({ ruleId: rule.id, reason: `condition group ${groupIndex + 1}: ${solved.unsolvable}` });
				return;
			}
			const build = (values: Map<string, unknown>) => {
				const usage = baseUsage(card, route);
				const body: Record<string, unknown> = { ...request.body };
				const context: Record<string, any> = {};
				let promptLength: number | undefined;
				if (!AGGREGATES.has(rule.meter) || !cardIsTokenPriced(card)) usage[rule.meter] = quantityFor(rule.meter);
				if (AGGREGATES.has(rule.meter) && !cardIsTokenPriced(card)) usage[rule.meter] = 12_347;
				const ttl = cacheTtlFor(rule.meter);
				if (ttl) body.cache_control = { type: "ephemeral", ttl };
				for (const [p, v] of values) {
					if (p === "input_tokens") promptLength = Number(v);
					else if (p === "cache_ttl") body.cache_control = { type: "ephemeral", ttl: v };
					else if (TOKEN_QTY[p] !== undefined || UNIT_QTY[p] !== undefined) {
						// Keep explicit zeros: a condition such as input_video_seconds eq 0 needs the meter present.
						if (v === undefined) delete usage[p];
						else usage[p] = Math.max(0, Number(v));
					} else if (v !== undefined) setPath(context, p, v);
				}
				finaliseUsage(usage, card, promptLength);
				const ttlValue = (body.cache_control as any)?.ttl;
				const scope = { ...context, ...(ttlValue ? { cache_ttl: ttlValue } : {}), ...usage };
				const winner = selectRule(rules, rule.meter, planChain(rules, request.plan), scope);
				return { usage, body, context, winner };
			};
			let built = build(solved.values);
			if (built.winner && built.winner.id !== rule.id && built.winner.pricing_plan === rule.pricing_plan && JSON.stringify(built.winner.match ?? []) !== JSON.stringify(rule.match ?? [])) {
				// Overlapping branches: at the boundary another rule wins. Step one unit inside each numeric bound.
				const boundaryWinner = built.winner;
				const numeric = [...solved.values.entries()].filter(([, v]) => typeof v === "number");
				for (const [p, v] of numeric) {
					for (const step of [1, -1]) {
						const values = new Map(solved.values);
						values.set(p, (v as number) + step);
						if (!group.every((c) => c.path !== p || conditionAccepts(c, (v as number) + step))) continue;
						const attempt = build(values);
						if (attempt.winner?.id === rule.id) {
							built = attempt;
							break;
						}
					}
					if (built.winner?.id === rule.id) break;
				}
				const [path0, value0] = numeric[0] ?? ["", undefined];
				overlaps.push({ ruleId: rule.id, winnerId: boundaryWinner.id, meter: rule.meter, path: String(path0), value: value0 });
			}
			const { usage, body, context } = built;
			const conditionLabel = group.length ? `.when(${group.map((c) => `${c.path}${c.op}${JSON.stringify(c.value)}`).join("&")})` : "";
			add({
				id: `rule.${request.plan}.${rule.meter}${conditionLabel}`,
				kind: "rule",
				targets: [rule.id],
				plan: request.plan,
				body,
				context,
				usage,
				timestampMs: SWEEP_NOW_MS,
			});
			for (const window of (rule.time_windows ?? []) as any[]) {
				add({
					id: `window.${request.plan}.${rule.meter}.${window.label ?? "window"}@${window.start_time}`,
					kind: "window",
					targets: [rule.id],
					plan: request.plan,
					body,
					context,
					usage: { ...usage },
					timestampMs: timestampInside(window),
				});
			}
		});
	}

	if (card.capability === "text.generate") {
		const meters = new Set(rules.map((r) => r.meter));
		const hasSplit = meters.has("cached_write_text_tokens_5m") || meters.has("cached_write_text_tokens_1h");
		const request = requestForPlan("standard", card) ?? { plan: "standard", body: { model: card.apiModelId } };
		const dialect = routeDialect(card.providerId, card.apiModelId);
		// Anthropic Messages upstreams report the TTL split (cache_creation.ephemeral_5m/1h); others report one count.
		if (hasSplit && dialect !== "anthropic-messages") {
			const ttls = meters.has("cached_write_text_tokens_1h") ? (["1h", "default"] as const) : (["default"] as const);
			for (const ttl of ttls) {
				const usage = baseUsage(card, route);
				const meter = ttl === "1h" ? "cached_write_text_tokens_1h" : "cached_write_text_tokens_5m";
				usage[meter] = TOKEN_QTY.cached_write_text_tokens;
				finaliseUsage(usage, card);
				add({
					id: `fallback.cache-write.no-ttl-split.ttl-${ttl}`,
					kind: "fallback",
					targets: [],
					plan: request.plan,
					body: { ...request.body, ...(ttl === "1h" ? { cache_control: { type: "ephemeral", ttl: "1h" } } : {}) },
					context: {},
					usage,
					timestampMs: SWEEP_NOW_MS,
					reportAs: { [meter]: "cached_write_text_tokens" },
					notes: ["provider reports one cache-write count without a TTL split (Bedrock, OpenAI-compatible); the request named the TTL"],
					source: { kind: "assumed", reason: "A write with no TTL split was made with the TTL the request asked for; without one, the 5 minute default (prompt caching docs: ttl 5m for short-lived context)." },
				});
			}
		}
		const writes = cacheWritesDocumented(card.providerId, card.apiModelId, meters.has("cached_read_text_tokens") || meters.has("implicit_cached_input_text_tokens"));
		if (writes.documented && ![...meters].some((m) => m.startsWith("cached_write_text_tokens"))) {
			const usage = baseUsage(card, route);
			usage.cached_write_text_tokens_5m = TOKEN_QTY.cached_write_text_tokens_5m;
			finaliseUsage(usage, card);
			add({
				id: "fallback.cache-write.no-rule",
				kind: "fallback",
				targets: [],
				plan: request.plan,
				body: { ...request.body, cache_control: { type: "ephemeral", ttl: "5m" } },
				context: {},
				usage,
				timestampMs: SWEEP_NOW_MS,
				notes: ["provider documents cache writes; the card has no cache-write price"],
				source: writes.source,
			});
		}
		add(documentedTextCase(card, route));
		const documentsReads = providerDocumentsCache(card.providerId).reads;
		const pricesReads = meters.has("cached_read_text_tokens") || meters.has("implicit_cached_input_text_tokens");
		if (documentsReads && !pricesReads && !["anthropic-messages", "gemini", "gemini-interactions"].includes(dialect)) {
			const variant = documentedTextCase(card, route, { unpricedRead: true });
			variant.notes = [...(variant.notes ?? []), "needs a live check: the provider documents cache-read usage fields provider-wide; this model may never return them"];
			add(variant);
		}
		const thresholds = [...new Set(rules.flatMap((r) => (r.match ?? []).filter((c) => c.path === "input_tokens" && ["gt", "gte", "lt", "lte"].includes(c.op)).map((c) => Number(c.value))))].filter((n) => n > 25_000).sort((a, b) => a - b);
		if (thresholds.length) add(documentedTextCase(card, route, { promptLength: thresholds[0] + 1 }));
	} else {
		add(documentedMediaCase(card, rules));
	}

	return { cases: [...cases.values()].sort((a, b) => a.id.localeCompare(b.id) || a.timestampMs - b.timestampMs), unreachable, overlaps };
}
