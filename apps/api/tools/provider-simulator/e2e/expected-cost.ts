// Purpose: Expected charge for a set of documented meter quantities under a catalogue price card.
// Why: Billing expectations are written as meter quantities from provider usage semantics; nanos follow from the card.
// How: Picks the standard-plan rule per meter whose match conditions hold, then sums quantity x price / unit size.

export type CardRule = {
	meter: string;
	unit_size: number;
	price_per_unit: string | number;
	pricing_plan?: string;
	match?: Array<{ path: string; op: string; value: unknown; or_group?: number; and_index?: number }>;
	priority?: number;
};

export type CostContext = {
	plan?: string;
	/** Values match conditions can reference, by dotted path (e.g. input_tokens, image_params.quality). */
	params?: Record<string, unknown>;
};

export type ExpectedLine = { meter: string; quantity: number; nanos: number; pricePerUnit: number | null; unitSize: number | null };

export type ExpectedCost = { totalNanos: number; lines: ExpectedLine[]; unpricedMeters: string[] };

function readPath(source: Record<string, unknown> | undefined, dotted: string): unknown {
	let node: unknown = source;
	for (const part of dotted.split(".")) {
		if (!node || typeof node !== "object") return undefined;
		node = (node as Record<string, unknown>)[part];
	}
	return node;
}

function conditionHolds(condition: { path: string; op: string; value: unknown }, params: Record<string, unknown> | undefined): boolean {
	const actual = readPath(params, condition.path);
	const expected = condition.value;
	switch (condition.op) {
		case "eq": return actual === expected || String(actual) === String(expected);
		case "ne":
		case "neq": return String(actual) !== String(expected);
		case "gt": return Number(actual) > Number(expected);
		case "gte": return Number(actual) >= Number(expected);
		case "lt": return Number(actual) < Number(expected);
		case "lte": return Number(actual) <= Number(expected);
		case "in": return Array.isArray(expected) && expected.map(String).includes(String(actual));
		case "exists": return actual !== undefined && actual !== null;
		default: return false;
	}
}

/** True when the rule has no conditions or any one OR-group has all its conditions satisfied. */
export function ruleMatches(rule: CardRule, params: Record<string, unknown> | undefined): boolean {
	const conditions = rule.match ?? [];
	if (!conditions.length) return true;
	const groups = new Map<number, typeof conditions>();
	for (const condition of conditions) {
		const key = condition.or_group ?? 0;
		groups.set(key, [...(groups.get(key) ?? []), condition]);
	}
	return [...groups.values()].some((group) => group.every((condition) => conditionHolds(condition, params)));
}

export function selectRule(rules: CardRule[], meter: string, ctx: CostContext): CardRule | null {
	const plan = ctx.plan ?? "standard";
	const candidates = rules.filter((rule) => rule.meter === meter && (rule.pricing_plan ?? "standard") === plan && ruleMatches(rule, ctx.params));
	if (!candidates.length) return null;
	// The most specific rule wins, then the lowest priority number.
	return [...candidates].sort((a, b) => (b.match?.length ?? 0) - (a.match?.length ?? 0) || (a.priority ?? 100) - (b.priority ?? 100))[0];
}

export function lineNanos(quantity: number, rule: CardRule): number {
	return Math.round((quantity * Number(rule.price_per_unit) * 1e9) / Number(rule.unit_size || 1));
}

export function expectedCost(rules: CardRule[], meters: Record<string, number>, ctx: CostContext = {}): ExpectedCost {
	const lines: ExpectedLine[] = [];
	const unpricedMeters: string[] = [];
	for (const [meter, quantity] of Object.entries(meters)) {
		if (!quantity) continue;
		const rule = selectRule(rules, meter, ctx);
		if (!rule) {
			unpricedMeters.push(meter);
			lines.push({ meter, quantity, nanos: 0, pricePerUnit: null, unitSize: null });
			continue;
		}
		lines.push({ meter, quantity, nanos: lineNanos(quantity, rule), pricePerUnit: Number(rule.price_per_unit), unitSize: Number(rule.unit_size) });
	}
	return { totalNanos: lines.reduce((sum, line) => sum + line.nanos, 0), lines, unpricedMeters };
}

/**
 * Folds meters the card does not price into the meter the provider bills them as.
 * OpenAI-style cached reads and cache writes are part of input: with no cache rule they cost the input price.
 */
export function foldUnpricedInto(rules: CardRule[], meters: Record<string, number>, folds: Record<string, string>, ctx: CostContext = {}): Record<string, number> {
	const out = { ...meters };
	for (const [meter, target] of Object.entries(folds)) {
		if (!out[meter]) continue;
		if (selectRule(rules, meter, ctx)) continue;
		out[target] = (out[target] ?? 0) + out[meter];
		delete out[meter];
	}
	return out;
}
