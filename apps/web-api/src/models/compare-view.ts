import { composeModelPricing } from "@/models/pricing";
import { plansForModel, providerRowsForModel, type ComparisonSources } from "@/models/compare";

type Row = Record<string, unknown>;

export type CompareView = {
	models: CompareViewModel[];
	benchmarks: CompareViewBenchmark[];
};

export type CompareViewModel = {
	id: string;
	name: string;
	lab: { id: string; name: string };
	status: string | null;
	releaseDate: string | null;
	announcedDate: string | null;
	deprecationDate: string | null;
	retirementDate: string | null;
	knowledgeCutoff: string | null;
	licence: string | null;
	inputTypes: string[];
	outputTypes: string[];
	contextWindow: { tokens: number; source: "model" | "providers" } | null;
	maxOutput: { tokens: number; source: "model" | "providers" } | null;
	features: {
		tools: boolean | null;
		structuredOutputs: boolean | null;
		reasoning: boolean | null;
		webSearch: boolean | null;
	};
	pricing: CompareViewPricing | null;
	providers: CompareViewProvider[];
	otherListings: Array<{ id: string; name: string }>;
	subscriptionPlans: Array<{ id: string; name: string; organisation: string; price: number | null; currency: string | null; frequency: string | null; link: string | null }>;
	links: { apiReference: string | null; announcement: string | null; paper: string | null; weights: string | null; repository: string | null };
};

export type CompareViewPricing = {
	provider: { id: string; name: string; routed: boolean };
	tiers: Record<string, CompareViewPriceRow[]>;
};

export type CompareViewPriceRow = {
	meter: string;
	kind: "input" | "output" | "cacheRead" | "cacheWrite5m" | "cacheWrite1h" | "cacheWrite" | "other";
	label: string | null;
	price: number;
	per: number;
	unit: string;
	conditional: boolean;
	/** Human-readable condition for conditional rows, e.g. "input tokens > 200K". */
	condition: string | null;
};

export type CompareViewProvider = {
	id: string;
	name: string;
	input: number | null;
	output: number | null;
	cacheRead: number | null;
	contextWindow: number | null;
	maxOutput: number | null;
	tiers: string[];
	quantisation: string | null;
};

export type CompareViewBenchmark = {
	id: string;
	name: string;
	category: string | null;
	higherIsBetter: boolean;
	type: "percentage" | "numerical" | null;
	source: "epoch" | "artificial-analysis" | "lab" | "independent";
	link: string | null;
	results: Record<string, CompareViewBenchmarkResult[]>;
};

export type CompareViewBenchmarkResult = {
	score: number;
	variant: string | null;
	effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | null;
	ci: [number, number] | null;
	selfReported: boolean;
	sourceLink: string | null;
};

type HeadlineKind = "input" | "output" | "cached";
type PricingGroup = ReturnType<typeof composeModelPricing>[number];
type ProviderModel = PricingGroup["provider_models"][number];

const NON_TEXT_MODALITY = /image|audio|video/;
const MILLION = 1_000_000;

function text(value: unknown): string {
	return String(value ?? "").trim();
}

function asRow(value: unknown): Row | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}

function relation(value: unknown): Row | null {
	return asRow(Array.isArray(value) ? value[0] : value);
}

function rows(value: unknown): Row[] {
	return Array.isArray(value) ? value.map(asRow).filter((row): row is Row => row !== null) : [];
}

function number(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function strings(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(text).filter(Boolean);
	return text(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function nullableText(value: unknown): string | null {
	return text(value) || null;
}

function time(value: unknown): number | null {
	if (!value) return null;
	const parsed = Date.parse(String(value));
	return Number.isFinite(parsed) ? parsed : null;
}

/** Same checks as the model page: routed, enabled, mapped and inside its effective window. */
export function isCurrentRoute(model: ProviderModel, now: number): boolean {
	if (!model.is_active_gateway) return false;
	if (text(model.capability_status).toLowerCase() === "disabled") return false;
	if (!model.endpoint || model.endpoint === "unmapped") return false;
	const from = time(model.effective_from);
	const to = time(model.effective_to);
	if (from !== null && now < from) return false;
	if (to !== null && now >= to) return false;
	return true;
}

/** 0 for text-token meters, 1 for other token modalities, null when the meter isn't a headline price. */
export function headlineMeterRank(meter: string | null | undefined, kind: HeadlineKind): number | null {
	const key = text(meter).toLowerCase();
	if (!key) return 0;
	if (!key.includes("token") || key.includes("reasoning")) return null;
	const cached = key.includes("cached");
	if (kind === "cached") {
		if (!cached || key.includes("write")) return null;
	} else if (cached) {
		return null;
	} else if (kind === "input" ? !key.includes("input") || key.includes("output") : !key.includes("output")) {
		return null;
	}
	return NON_TEXT_MODALITY.test(key) ? 1 : 0;
}

function isStandardPlan(plan: unknown): boolean {
	const key = text(plan).toLowerCase();
	return !key || key === "standard";
}

function hasConditions(rule: Row): boolean {
	return Array.isArray(rule.match) && rule.match.length > 0;
}

function pricePerUnit(rule: Row): number | null {
	const price = number(rule.price_per_unit);
	const size = number(rule.unit_size) ?? 1;
	if (price === null || size <= 0) return null;
	return price / size;
}

/**
 * Base-tier rules: unconditional rules, or for meters priced only by condition
 * (e.g. "input tokens ≤ 200K" and "> 200K"), the cheapest one.
 */
function baseRules(rules: Row[]): Row[] {
	const byMeter = new Map<string, Row[]>();
	for (const rule of rules) {
		const key = `${text(rule.pricing_plan).toLowerCase() || "standard"}|${text(rule.meter)}`;
		byMeter.set(key, [...(byMeter.get(key) ?? []), rule]);
	}
	return [...byMeter.values()].map((group) => {
		const plain = group.filter((rule) => !hasConditions(rule));
		const candidates = plain.length ? plain : group;
		return candidates.reduce((best, rule) => ((pricePerUnit(rule) ?? Infinity) < (pricePerUnit(best) ?? Infinity) ? rule : best));
	});
}

function headlinePrice(rules: Row[], kind: HeadlineKind): number | null {
	let best: { rank: number; value: number } | null = null;
	for (const rule of baseRules(rules.filter((rule) => isStandardPlan(rule.pricing_plan)))) {
		const rank = headlineMeterRank(text(rule.meter), kind);
		if (rank === null) continue;
		const unitPrice = pricePerUnit(rule);
		if (unitPrice === null) continue;
		const value = unitPrice * MILLION;
		if (!best || rank < best.rank || (rank === best.rank && value < best.value)) best = { rank, value };
	}
	return best ? roundPrice(best.value) : null;
}

function roundPrice(value: number): number {
	return Math.round(value * 1e9) / 1e9;
}

function isLabProvider(providerId: string, labId: string): boolean {
	return Boolean(labId) && (providerId === labId || providerId.startsWith(`${labId}-`));
}

function displayPer(unit: string): number {
	if (unit === "token") return MILLION;
	if (unit === "request" || unit === "character") return 1_000;
	return 1;
}

function priceRowKind(meter: string): CompareViewPriceRow["kind"] {
	const key = meter.toLowerCase();
	if (key.includes("reasoning") || !key.includes("token")) return "other";
	if (key.includes("cached") || key.includes("cache_")) {
		if (key.includes("write")) {
			if (/_5m\b|_5m$/.test(key)) return "cacheWrite5m";
			if (/_1h\b|_1h$/.test(key)) return "cacheWrite1h";
			return NON_TEXT_MODALITY.test(key) ? "other" : "cacheWrite";
		}
		return NON_TEXT_MODALITY.test(key) ? "other" : "cacheRead";
	}
	if (NON_TEXT_MODALITY.test(key)) return "other";
	if (key.includes("input")) return "input";
	if (key.includes("output")) return "output";
	return "other";
}

const COMPARISON_SYMBOLS: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥", eq: "=" };

function compactNumber(value: unknown): string {
	const parsed = number(value);
	if (parsed === null) return text(value);
	if (parsed >= MILLION && parsed % 1_000 === 0) return `${parsed / MILLION}M`;
	if (parsed >= 1_000 && parsed % 1_000 === 0) return `${parsed / 1_000}K`;
	return String(parsed);
}

function describeConditions(match: unknown): string | null {
	const parts = rows(match).map((condition) => {
		const path = text(condition.path).replace(/_/g, " ");
		const op = COMPARISON_SYMBOLS[text(condition.op)] ?? text(condition.op);
		return path && op ? `${path} ${op} ${compactNumber(condition.value)}` : "";
	}).filter(Boolean);
	return parts.length ? parts.join(" and ") : null;
}

function displayLabel(rule: Row): string | null {
	const label = text(rule.display_label);
	// Some catalogue rows repeat the meter key as the label.
	if (!label || label === text(rule.meter) || /^[a-z0-9_]+$/.test(label)) return null;
	return label;
}

function tierRows(rules: Row[]): Record<string, CompareViewPriceRow[]> {
	const tiers: Record<string, CompareViewPriceRow[]> = {};
	const seen = new Set<string>();
	for (const rule of rules) {
		const unitPrice = pricePerUnit(rule);
		if (unitPrice === null) continue;
		const plan = text(rule.pricing_plan).toLowerCase() || "standard";
		const meter = text(rule.meter);
		const unit = text(rule.unit).toLowerCase() || "token";
		const per = displayPer(unit);
		const condition = hasConditions(rule) ? describeConditions(rule.match) : null;
		const key = `${plan}|${meter}|${condition ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		(tiers[plan] ??= []).push({
			meter,
			kind: priceRowKind(meter),
			label: displayLabel(rule),
			price: roundPrice(unitPrice * per),
			per,
			unit,
			conditional: hasConditions(rule),
			condition,
		});
	}
	const kindOrder: Record<CompareViewPriceRow["kind"], number> = { input: 0, output: 1, cacheRead: 2, cacheWrite5m: 3, cacheWrite1h: 4, cacheWrite: 5, other: 6 };
	for (const list of Object.values(tiers)) {
		list.sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind]
			|| Number(left.conditional) - Number(right.conditional)
			|| left.meter.localeCompare(right.meter)
			|| left.price - right.price);
	}
	return Object.fromEntries(sortPlans(Object.keys(tiers)).map((plan) => [plan, tiers[plan]]));
}

const PLAN_ORDER = ["standard", "batch", "flex", "priority"];

/** Standard first, then the usual discount and premium tiers, then anything else alphabetically. */
function sortPlans(plans: string[]): string[] {
	const rank = (plan: string) => {
		const index = PLAN_ORDER.indexOf(plan);
		return index < 0 ? PLAN_ORDER.length : index;
	};
	return [...plans].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
}

function paramNames(value: unknown): string[] {
	if (Array.isArray(value)) return value.map((item) => text(asRow(item)?.param_id ?? asRow(item)?.name ?? item).toLowerCase()).filter(Boolean);
	const row = asRow(value);
	if (row) return Object.keys(row).map((key) => key.toLowerCase());
	return strings(value).map((item) => item.toLowerCase());
}

type ProviderEntry = {
	id: string;
	name: string;
	rules: Row[];
	currentModels: ProviderModel[];
	allModels: ProviderModel[];
	input: number | null;
	output: number | null;
	cacheRead: number | null;
};

function providerEntries(groups: PricingGroup[], now: number): ProviderEntry[] {
	return groups.map((group) => {
		const currentModels = group.provider_models.filter((model) => isCurrentRoute(model, now));
		const rules = group.pricing_rules as Row[];
		return {
			id: group.provider.api_provider_id,
			name: text(group.provider.api_provider_name) || group.provider.api_provider_id,
			rules,
			currentModels,
			allModels: group.provider_models,
			input: headlinePrice(rules, "input"),
			output: headlinePrice(rules, "output"),
			cacheRead: headlinePrice(rules, "cached"),
		};
	});
}

function hasAnyPrice(entry: ProviderEntry): boolean {
	return entry.rules.some((rule) => pricePerUnit(rule) !== null);
}

/** Cheapest standard input + output first, then the lab's own route on a tie; unpriced last. */
function compareEntries(labId: string) {
	return (left: ProviderEntry, right: ProviderEntry) => {
		const leftPriced = left.input !== null || left.output !== null;
		const rightPriced = right.input !== null || right.output !== null;
		if (leftPriced !== rightPriced) return leftPriced ? -1 : 1;
		const leftTotal = (left.input ?? 0) + (left.output ?? 0);
		const rightTotal = (right.input ?? 0) + (right.output ?? 0);
		if (leftTotal !== rightTotal) return leftTotal - rightTotal;
		const leftLab = isLabProvider(left.id, labId);
		const rightLab = isLabProvider(right.id, labId);
		if (leftLab !== rightLab) return leftLab ? -1 : 1;
		if (hasAnyPrice(left) !== hasAnyPrice(right)) return hasAnyPrice(left) ? -1 : 1;
		return left.name.localeCompare(right.name);
	};
}

/** One entry per display name: regional and duplicate listings of the same provider collapse into the cheapest. */
function dedupeByName(entries: ProviderEntry[]): ProviderEntry[] {
	const byName = new Map<string, ProviderEntry>();
	for (const entry of entries) {
		const key = entry.name.toLowerCase();
		if (!byName.has(key)) byName.set(key, entry);
	}
	return [...byName.values()];
}

function maxOf(values: Array<number | null>): number | null {
	const present = values.filter((value): value is number => value !== null && value > 0);
	return present.length ? Math.max(...present) : null;
}

function plansOf(entry: ProviderEntry): string[] {
	return sortPlans([...new Set(entry.rules.filter((rule) => pricePerUnit(rule) !== null).map((rule) => text(rule.pricing_plan).toLowerCase() || "standard"))]);
}

function toProvider(entry: ProviderEntry): CompareViewProvider {
	return {
		id: entry.id,
		name: entry.name,
		input: entry.input,
		output: entry.output,
		cacheRead: entry.cacheRead,
		contextWindow: maxOf(entry.currentModels.map((model) => number(model.context_length) ?? number(model.max_input_tokens))),
		maxOutput: maxOf(entry.currentModels.map((model) => number(model.max_output_tokens))),
		tiers: plansOf(entry),
		quantisation: entry.currentModels.map((model) => model.quantization_scheme).find(Boolean) ?? null,
	};
}

function featureFlags(routed: ProviderEntry[]): CompareViewModel["features"] {
	const params = routed.flatMap((entry) => entry.currentModels.map((model) => paramNames(model.params)));
	const hasParams = params.some((list) => list.length > 0);
	const any = (names: string[]) => hasParams ? params.some((list) => list.some((name) => names.includes(name))) : null;
	const meters = routed.flatMap((entry) => entry.rules.map((rule) => text(rule.meter).toLowerCase()));
	return {
		tools: any(["tools", "tool_choice"]),
		structuredOutputs: any(["structured_outputs", "response_format"]),
		reasoning: any(["reasoning", "reasoning_effort", "include_reasoning"]),
		webSearch: routed.length ? meters.some((meter) => meter.includes("web_search")) : null,
	};
}

const EFFORTS: Array<[RegExp, NonNullable<CompareViewBenchmarkResult["effort"]>]> = [
	[/\bx-?high\b/i, "xhigh"],
	[/\bmax(imum)?\b/i, "max"],
	[/\bhigh\b/i, "high"],
	[/\bmedium\b/i, "medium"],
	[/\blow\b/i, "low"],
	[/\bminimal\b/i, "minimal"],
];

export function parseEffort(variant: string | null): CompareViewBenchmarkResult["effort"] {
	if (!variant) return null;
	for (const [pattern, effort] of EFFORTS) if (pattern.test(variant)) return effort;
	return null;
}

const SOURCE_NOTE = /launch evaluation|-reported|reported by|source chart|^epoch ai model/i;

export function parseVariant(otherInfo: unknown, source: CompareViewBenchmark["source"]): string | null {
	const info = text(otherInfo);
	if (!info || source === "epoch") return null;
	if (source === "artificial-analysis") {
		const inner = /\(([^)]*)\)/.exec(info)?.[1];
		return inner ? inner.split(",")[0]?.trim() || null : null;
	}
	const first = info.split(";")[0]?.trim() ?? "";
	if (!first || first.length > 60 || SOURCE_NOTE.test(first)) return null;
	return first;
}

export function parseConfidenceInterval(otherInfo: unknown): [number, number] | null {
	const match = /95%\s*CI\s*([\d.]+)\s*[–—-]\s*([\d.]+)/i.exec(text(otherInfo));
	if (!match) return null;
	const low = Number(match[1]);
	const high = Number(match[2]);
	return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}

function benchmarkType(value: unknown): CompareViewBenchmark["type"] {
	const normalized = text(value).toLowerCase();
	if (["percentage", "percent", "pct", "%"].includes(normalized)) return "percentage";
	if (["numerical", "numeric", "number"].includes(normalized)) return "numerical";
	return null;
}

const SOURCE_ORDER: Record<CompareViewBenchmark["source"], number> = { epoch: 0, "artificial-analysis": 1, independent: 2, lab: 3 };

function composeBenchmarks(models: Row[]): CompareViewBenchmark[] {
	const benchmarks = new Map<string, CompareViewBenchmark>();
	const raw = new Map<string, Array<{ modelId: string; result: Row }>>();
	for (const model of models) {
		const modelId = text(model.model_id);
		for (const result of rows(model.benchmark_results)) {
			const benchmark = relation(result.benchmark);
			const benchmarkId = text(benchmark?.id) || text(result.benchmark_id);
			if (!benchmarkId || number(result.score) === null) continue;
			if (!benchmarks.has(benchmarkId)) {
				benchmarks.set(benchmarkId, {
					id: benchmarkId,
					name: text(benchmark?.name) || benchmarkId,
					category: nullableText(benchmark?.category),
					higherIsBetter: benchmark?.ascending_order !== false,
					type: benchmarkType(benchmark?.type),
					source: benchmarkId === "epoch-capabilities-index" ? "epoch" : benchmarkId.startsWith("aa-") ? "artificial-analysis" : "independent",
					link: nullableText(benchmark?.link),
					results: {},
				});
			}
			raw.set(benchmarkId, [...(raw.get(benchmarkId) ?? []), { modelId, result }]);
		}
	}
	for (const [benchmarkId, entries] of raw) {
		const benchmark = benchmarks.get(benchmarkId)!;
		if (benchmark.source === "independent" && entries.some(({ result }) => Boolean(result.is_self_reported))) benchmark.source = "lab";
		for (const { modelId, result } of entries) {
			const variant = parseVariant(result.other_info, benchmark.source);
			const list = benchmark.results[modelId] ??= [];
			const score = number(result.score)!;
			// Identical rows from repeated imports add nothing.
			if (list.some((item) => item.score === score && item.variant === variant)) continue;
			list.push({
				score,
				variant,
				effort: parseEffort(variant),
				ci: parseConfidenceInterval(result.other_info),
				selfReported: Boolean(result.is_self_reported),
				sourceLink: nullableText(result.source_link),
			});
		}
		for (const list of Object.values(benchmark.results)) list.sort((left, right) => benchmark.higherIsBetter ? right.score - left.score : left.score - right.score);
	}
	return [...benchmarks.values()].sort((left, right) =>
		Object.keys(right.results).length - Object.keys(left.results).length
		|| SOURCE_ORDER[left.source] - SOURCE_ORDER[right.source]
		|| left.name.localeCompare(right.name));
}

function firstPlanPrice(prices: unknown): { price: number | null; currency: string | null; frequency: string | null } {
	const list = rows(prices);
	const preferred = list.find((price) => text(price.frequency).toLowerCase().startsWith("month")) ?? list[0];
	return {
		price: number(preferred?.price),
		currency: nullableText(preferred?.currency),
		frequency: nullableText(preferred?.frequency),
	};
}

function composeModel(model: Row, source: ComparisonSources, now: number): CompareViewModel {
	const modelId = text(model.model_id);
	const labId = text(model.organisation_id);
	const organisation = relation(model.organisation);
	const details = new Map(rows(model.model_details).map((detail) => [text(detail.detail_name), detail.detail_value ?? null]));
	const links = new Map<string, string>();
	for (const link of rows(model.model_links)) {
		const kind = text(link.kind) || text(link.platform);
		if (kind && !links.has(kind) && text(link.url)) links.set(kind, text(link.url));
	}
	const groups = composeModelPricing(providerRowsForModel(modelId, source.providerRows), source.pricingRows);
	const entries = providerEntries(groups, now).sort(compareEntries(labId));
	const routed = dedupeByName(entries.filter((entry) => entry.currentModels.length > 0));
	const routedNames = new Set(routed.map((entry) => entry.name.toLowerCase()));
	const otherListings = dedupeByName(entries.filter((entry) => entry.currentModels.length === 0 && !routedNames.has(entry.name.toLowerCase())))
		.map((entry) => ({ id: entry.id, name: entry.name }))
		.sort((left, right) => left.name.localeCompare(right.name));

	const priced = (list: ProviderEntry[]) => list.find((entry) => entry.input !== null || entry.output !== null) ?? list.find(hasAnyPrice) ?? null;
	const headlineRouted = priced(routed);
	const headline = headlineRouted ?? priced(entries);
	const pricing: CompareViewPricing | null = headline ? {
		provider: { id: headline.id, name: headline.name, routed: headlineRouted !== null },
		tiers: tierRows(headline.rules),
	} : null;

	const providerContext = maxOf(routed.flatMap((entry) => entry.currentModels.map((item) => number(item.context_length) ?? number(item.max_input_tokens))));
	const providerMaxOutput = maxOf(routed.flatMap((entry) => entry.currentModels.map((item) => number(item.max_output_tokens))));
	const modelContext = number(details.get("input_context_length"));
	const modelMaxOutput = number(details.get("output_context_length"));

	return {
		id: modelId,
		name: text(model.name) || modelId,
		lab: { id: labId, name: text(organisation?.name) || labId },
		status: nullableText(model.status),
		releaseDate: nullableText(model.release_date),
		announcedDate: nullableText(model.announcement_date),
		deprecationDate: nullableText(model.deprecation_date),
		retirementDate: nullableText(model.retirement_date),
		knowledgeCutoff: nullableText(details.get("knowledge_cutoff")),
		licence: nullableText(details.get("license") ?? model.license),
		inputTypes: strings(model.input_types),
		outputTypes: strings(model.output_types),
		contextWindow: modelContext ? { tokens: modelContext, source: "model" } : providerContext ? { tokens: providerContext, source: "providers" } : null,
		maxOutput: modelMaxOutput ? { tokens: modelMaxOutput, source: "model" } : providerMaxOutput ? { tokens: providerMaxOutput, source: "providers" } : null,
		features: featureFlags(routed),
		pricing,
		providers: routed.map(toProvider),
		otherListings,
		subscriptionPlans: (plansForModel(modelId, source.modelPlans, source.plans) ?? []).map((plan) => {
			const organisationRow = asRow(plan.organisation);
			return {
				id: text(plan.plan_id),
				name: text(plan.name),
				organisation: text(organisationRow?.name),
				...firstPlanPrice(plan.prices),
				link: nullableText(plan.link),
			};
		}),
		links: {
			apiReference: links.get("api_reference") ?? links.get("documentation") ?? null,
			announcement: links.get("announcement") ?? null,
			paper: links.get("paper") ?? null,
			weights: links.get("weights") ?? null,
			repository: links.get("repository") ?? null,
		},
	};
}

export function composeCompareView(modelIds: string[], source: ComparisonSources, now = Date.now()): CompareView {
	const byId = new Map(source.models.map((model) => [text(model.model_id), model]));
	const selected = modelIds.flatMap((modelId) => {
		const model = byId.get(modelId);
		return model ? [model] : [];
	});
	return {
		models: selected.map((model) => composeModel(model, source, now)),
		benchmarks: composeBenchmarks(selected),
	};
}
