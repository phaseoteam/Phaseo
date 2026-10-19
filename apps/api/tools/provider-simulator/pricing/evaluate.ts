// Purpose: Run the gateway's real pricing on a sweep case and compare it with the independent expected bill.
// Why: The sweep reports where production billing departs from the catalogue and the documented rules.
// How: Loads calculatePricing and normalizeTextUsageForPricing by name at run time (so a replacement engine with new
//      usage aliases or a cache-read fallback is picked up without edits), shapes the case's usage the way the gateway
//      hands it to pricing, and turns differences into Mismatch records (layer "pricing").

import type { Mismatch, Source } from "../src/expect/types";
import type { ExpectedBill } from "./calculator";
import type { PricingCase } from "./cases";
import { isTokenMeter } from "./cases";
import type { SweepCard } from "./catalogue-cards";

export type EngineLine = { dimension: string; quantity: number; line_nanos: number; unit_price_usd?: string; unit_size?: number };
export type EngineResult =
	| { ok: true; nanos: number; lines: EngineLine[]; usageSent: Record<string, unknown> }
	| { ok: false; error: string; usageSent: Record<string, unknown> };

type Engine = {
	calculatePricing: (usage: any, card: any, body: any, tier?: string | null, meta?: any) => { totalNanos: number; pricedUsage: any };
	normalizeTextUsageForPricing: (usage: any, options?: any) => Record<string, any> | undefined;
};

let engine: Engine | null = null;

/** Loads the gateway pricing entry points. Throws (a harness error) only when they are missing altogether. */
export async function loadEngine(): Promise<Engine> {
	if (engine) return engine;
	const pricing: any = await import("@pipeline/after/pricing");
	const usage: any = await import("@executors/_shared/usage/text");
	if (typeof pricing.calculatePricing !== "function") throw new Error("harness: @pipeline/after/pricing no longer exports calculatePricing");
	if (typeof usage.normalizeTextUsageForPricing !== "function") throw new Error("harness: @executors/_shared/usage/text no longer exports normalizeTextUsageForPricing");
	engine = { calculatePricing: pricing.calculatePricing, normalizeTextUsageForPricing: usage.normalizeTextUsageForPricing };
	return engine;
}

/** The usage object the gateway hands to calculatePricing for this case. */
export function engineUsage(entry: PricingCase, eng: Engine): Record<string, any> {
	if (entry.irUsage) {
		const normalised = eng.normalizeTextUsageForPricing(structuredClone(entry.irUsage)) ?? {};
		return Object.keys(entry.context).length ? { ...normalised, context: structuredClone(entry.context) } : normalised;
	}
	const out: Record<string, any> = {};
	for (const [meter, quantity] of Object.entries(entry.usage)) {
		const key = entry.reportAs?.[meter] ?? meter;
		out[key] = (out[key] ?? 0) + quantity;
	}
	// Implicit cache hits are reported as cache reads; the engine derives the implicit meter itself.
	if (out.implicit_cached_input_text_tokens !== undefined) {
		out.cached_read_text_tokens = (out.cached_read_text_tokens ?? 0) + out.implicit_cached_input_text_tokens;
		delete out.implicit_cached_input_text_tokens;
	}
	// Gateway convention (normalizeTextUsageForPricing): output_text_tokens counts reasoning; the engine splits it out
	// when the card prices reasoning separately.
	if (typeof out.output_text_tokens === "number" && typeof entry.usage.output_reasoning_tokens === "number") {
		out.output_text_tokens += entry.usage.output_reasoning_tokens;
	}
	if (Object.keys(entry.context).length) out.context = structuredClone(entry.context);
	return out;
}

export function runEngine(card: SweepCard, entry: PricingCase, eng: Engine): EngineResult {
	const usageSent = engineUsage(entry, eng);
	const meta = { startedAtMs: entry.timestampMs, upstreamStartMs: entry.timestampMs, completedAtMs: entry.timestampMs };
	const quiet = { error: console.error, log: console.log, warn: console.warn };
	console.error = () => {};
	console.log = () => {};
	console.warn = () => {};
	try {
		const result = eng.calculatePricing(structuredClone(usageSent), structuredClone(card.card), structuredClone(entry.body), null, meta);
		const lines: EngineLine[] = (result?.pricedUsage?.pricing?.lines ?? []).map((line: any) => ({
			dimension: String(line.dimension),
			quantity: Number(line.quantity),
			line_nanos: Number(line.line_nanos ?? 0),
			unit_price_usd: line.unit_price_usd,
			unit_size: line.unit_size,
		}));
		return { ok: true, nanos: Number(result?.totalNanos ?? 0), lines, usageSent };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error), usageSent };
	} finally {
		console.error = quiet.error;
		console.log = quiet.log;
		console.warn = quiet.warn;
	}
}

// ---------------------------------------------------------------------------
// Comparison

/** Per-line rounding differs (the oracle rounds once per rule, the engine once per meter); allow a few nanos. */
export const TOLERANCE_NANOS = 3;

const CATALOGUE_CONTRACT: Source = {
	kind: "assumed",
	reason: "The route's catalogue price card is the billing contract: each usage meter is billed once, at the rule matching the requested plan and conditions (apps/docs/v1/exploring/pricing-performance.mdx describes the meters; no page states the selection rules).",
};

function family(capability: string): string {
	return capability === "text.generate" ? "text" : capability;
}

function base(card: SweepCard, entry: PricingCase): Pick<Mismatch, "layer" | "provider" | "family" | "model" | "surface" | "caseId"> {
	return {
		layer: "pricing",
		provider: card.providerId,
		family: family(card.capability),
		model: card.apiModelId,
		surface: card.capability,
		caseId: `${card.capability}:${entry.id}`,
	};
}

function sumBy<T>(items: T[], key: (item: T) => string | null, value: (item: T) => number): Map<string, number> {
	const out = new Map<string, number>();
	for (const item of items) {
		const k = key(item);
		if (!k) continue;
		out.set(k, (out.get(k) ?? 0) + value(item));
	}
	return out;
}

export type Comparison = { mismatches: Mismatch[]; deltaNanos: number; errored: boolean };

export function compare(card: SweepCard, entry: PricingCase, expected: ExpectedBill, actual: EngineResult): Comparison {
	const mismatches: Mismatch[] = [];
	const shared = base(card, entry);
	const fallbackSources = expected.lines.filter((line) => line.source).map((line) => line.source!);
	const caseSource = entry.source ?? fallbackSources[0] ?? CATALOGUE_CONTRACT;
	const noteParts = [...(entry.notes ?? [])];
	for (const line of expected.lines) if (line.fallback) noteParts.push(`${line.meter}: ${line.fallback}`);

	if (actual.ok === false) {
		const meter = /:(\w+)/.exec(actual.error)?.[1];
		mismatches.push({
			...shared,
			kind: "wrong_value",
			path: "billing.error",
			expected: { nanos: expected.nanos },
			actual: actual.error,
			delta: { nanos: -expected.nanos, ...(meter ? { meter } : {}) },
			source: caseSource,
			note: [`pricing threw; the request would fail after the provider was paid`, ...noteParts].join("; "),
		});
		return { mismatches, deltaNanos: -expected.nanos, errored: true };
	}

	const delta = actual.nanos - expected.nanos;
	const tolerance = Math.max(TOLERANCE_NANOS, expected.lines.length + actual.lines.length);
	if (Math.abs(delta) <= tolerance) return { mismatches, deltaNanos: 0, errored: false };

	// Attribute the difference to the meter with the largest gap. Expected lines are grouped by the meter whose rule
	// priced them, which is how the engine names its lines (reasoning folded into output, for example).
	const expectedByMeter = sumBy(expected.lines, (line) => line.pricedAs ?? line.meter, (line) => line.nanos);
	const actualByMeter = sumBy(actual.lines, (line) => line.dimension, (line) => line.line_nanos);
	let worst: { meter: string; gap: number } | null = null;
	for (const meter of new Set([...expectedByMeter.keys(), ...actualByMeter.keys()])) {
		const gap = (actualByMeter.get(meter) ?? 0) - (expectedByMeter.get(meter) ?? 0);
		if (Math.sign(gap) !== Math.sign(delta)) continue;
		if (!worst || Math.abs(gap) > Math.abs(worst.gap)) worst = { meter, gap };
	}
	const meter = worst?.meter;
	const expectedQty = meter ? expected.lines.filter((line) => (line.pricedAs ?? line.meter) === meter).reduce((sum, line) => sum + line.quantity, 0) : 0;
	const tokenQty = meter ? (expectedQty || actual.lines.find((line) => line.dimension === meter)?.quantity) : undefined;
	mismatches.push({
		...shared,
		kind: delta > 0 ? "billing_over" : "billing_under",
		path: "billing.total_nanos",
		expected: { nanos: expected.nanos, lines: expected.lines.map((line) => [line.meter, line.pricedAs, line.ruleId, line.quantity, line.nanos]) },
		actual: { nanos: actual.nanos, lines: actual.lines.map((line) => [line.dimension, line.quantity, line.unit_price_usd, line.line_nanos]) },
		delta: { nanos: delta, ...(meter ? { meter } : {}), ...(meter && isTokenMeter(meter) && typeof tokenQty === "number" ? { tokens: Math.sign(delta) * tokenQty } : {}) },
		source: caseSource,
		...(noteParts.length ? { note: noteParts.join("; ") } : {}),
	});

	// Meters billed with no expected charge, and expected charges with no engine line.
	const expectedMeters = new Set(expected.lines.filter((line) => line.nanos > 0).flatMap((line) => [line.meter, line.pricedAs ?? line.meter]));
	for (const line of actual.lines) {
		if (line.line_nanos > 0 && !expectedMeters.has(line.dimension)) {
			mismatches.push({
				...shared,
				kind: "invented",
				path: `billing.meter.${line.dimension}`,
				expected: null,
				actual: { quantity: line.quantity, nanos: line.line_nanos },
				delta: { nanos: line.line_nanos, meter: line.dimension },
				source: caseSource,
				note: "engine billed a meter the expected bill does not charge",
			});
		}
	}
	const actualMeters = new Set(actual.lines.filter((line) => line.line_nanos > 0).map((line) => line.dimension));
	for (const line of expected.lines) {
		if (line.nanos > 0 && !actualMeters.has(line.meter) && !(line.pricedAs && actualMeters.has(line.pricedAs))) {
			mismatches.push({
				...shared,
				kind: "dropped",
				path: `billing.meter.${line.meter}`,
				expected: { quantity: line.quantity, nanos: line.nanos, rule: line.ruleId },
				actual: null,
				delta: { nanos: -line.nanos, meter: line.meter },
				source: line.source ?? caseSource,
				note: "expected charge has no engine line",
			});
		}
	}
	return { mismatches, deltaNanos: delta, errored: false };
}
