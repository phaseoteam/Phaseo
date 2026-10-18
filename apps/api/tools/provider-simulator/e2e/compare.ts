// Purpose: Compare an end-to-end Observation with declarative checks and emit Mismatch records.
// Why: Expectations live in JSON with cited sources; one pure comparator keeps every case judged the same way.
// How: Each check reads a path in the observation, applies its operator, and maps a failure to a mismatch kind.

import type { Mismatch, MismatchKind } from "../src/expect/types";
import { expectedCost, foldUnpricedInto, type CardRule } from "./expected-cost";
import type { BillingSpec, CardLookup, Check, ExpectationEntry, Observation } from "./types";

const TOKEN = /([^.[\]]+)|\[(-?\d+)\]/g;

/** Reads `a.b[0].c` (negative indexes count from the end; `length` works on arrays and strings). */
export function getPath(value: unknown, path: string): unknown {
	let node: unknown = value;
	for (const match of path.matchAll(TOKEN)) {
		if (node === undefined || node === null) return undefined;
		if (match[2] !== undefined) {
			if (!Array.isArray(node)) return undefined;
			const index = Number(match[2]);
			node = node[index < 0 ? node.length + index : index];
			continue;
		}
		const key = match[1];
		if (key === "length" && (Array.isArray(node) || typeof node === "string")) {
			node = (node as unknown[] | string).length;
			continue;
		}
		node = typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined;
	}
	return node;
}

export function caseMatches(pattern: string | string[], caseId: string): boolean {
	const patterns = Array.isArray(pattern) ? pattern : [pattern];
	return patterns.some((entry) => entry === "*" || (entry.startsWith("re:") ? new RegExp(entry.slice(3)).test(caseId) : entry === caseId));
}

function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function sseTexts(obs: Observation): string[] {
	return (obs.client.sse ?? []).map((frame) => `${frame.event ?? ""} ${typeof frame.data === "string" ? frame.data : JSON.stringify(frame.data)}`);
}

type Verdict = { pass: boolean; actual: unknown; kind: MismatchKind; delta?: Mismatch["delta"]; expected?: unknown; extra?: Array<Omit<Mismatch, "layer" | "provider" | "family" | "caseId" | "source">> };

function defaultKind(check: Check, actual: unknown): MismatchKind {
	if (check.kind) return check.kind;
	if (check.op === "present") return "dropped";
	if (check.op === "absent" || check.op === "excludes" || check.op === "sseExcludes") return "invented";
	if (check.op === "sseLast") return "stream_order";
	if (check.op === "sseIncludes") return "dropped";
	if (actual === undefined) return "dropped";
	if (check.value !== undefined && actual !== null && typeof actual !== typeof check.value && !Array.isArray(check.value)) return "wrong_type";
	return "wrong_value";
}

function evaluateBilling(obs: Observation, spec: BillingSpec, cards: CardLookup): Verdict {
	const served = obs.billing.servedProvider ?? obs.upstream.providers.at(-1) ?? obs.routes[0] ?? null;
	const rules: CardRule[] | null = cards(served);
	if (!rules) {
		return { pass: false, actual: obs.billing.chargeNanos, kind: "wrong_value", expected: "a catalogue price card for the served route" };
	}
	const ctx = { params: spec.params };
	const meters = spec.foldUnpriced ? foldUnpricedInto(rules, spec.meters, spec.foldUnpriced, ctx) : spec.meters;
	const expected = expectedCost(rules, meters, ctx);
	const factor = spec.factor ?? 1;
	const expectedNanos = Math.round(expected.totalNanos * factor);
	const tolerance = spec.toleranceNanos ?? 2 * Math.max(1, expected.lines.length);
	const actual = obs.billing.chargeNanos;
	const diff = actual - expectedNanos;
	const extra: NonNullable<Verdict["extra"]> = [];
	if (factor === 1) {
		for (const line of expected.lines) {
			const observed = obs.billing.meters[line.meter] ?? 0;
			if (observed === line.quantity) continue;
			const tokens = observed - line.quantity;
			const nanos = line.pricePerUnit === null ? 0 : Math.round((tokens * line.pricePerUnit * 1e9) / (line.unitSize || 1));
			extra.push({
				kind: tokens > 0 ? "billing_over" : "billing_under",
				path: `billing.meter.${line.meter}`,
				expected: line.quantity,
				actual: observed,
				delta: { tokens, nanos, meter: line.meter },
				note: line.pricePerUnit === null ? "the card has no rule for this meter" : undefined,
			});
		}
		for (const [meter, quantity] of Object.entries(obs.billing.meters)) {
			if (meters[meter] !== undefined || !quantity) continue;
			const line = obs.billing.lines.find((entry) => entry.meter === meter);
			if (!line || line.lineNanos <= 0) continue;
			extra.push({ kind: "billing_over", path: `billing.meter.${meter}`, expected: 0, actual: quantity, delta: { tokens: quantity, nanos: line.lineNanos, meter }, note: "meter billed that the documented usage does not produce" });
		}
	}
	return {
		pass: Math.abs(diff) <= tolerance,
		actual,
		expected: expectedNanos,
		kind: diff > 0 ? "billing_over" : "billing_under",
		delta: { nanos: diff },
		extra,
	};
}

export function evaluateCheck(obs: Observation, check: Check, cards: CardLookup): Verdict {
	if (check.op === "billing") return evaluateBilling(obs, check.value as BillingSpec, cards);
	const actual = check.op.startsWith("sse") ? obs.client.sse : getPath(obs, check.path);
	let pass: boolean;
	switch (check.op) {
		case "equals": pass = deepEqual(actual, check.value); break;
		case "oneOf": pass = Array.isArray(check.value) && check.value.some((value) => deepEqual(actual, value)); break;
		case "present": pass = actual !== undefined && actual !== null; break;
		case "absent": pass = actual === undefined || actual === null; break;
		case "matches": pass = typeof actual === "string" && new RegExp(String(check.value)).test(actual); break;
		case "includes": pass = Array.isArray(actual) ? actual.some((entry) => deepEqual(entry, check.value)) : typeof actual === "string" && actual.includes(String(check.value)); break;
		case "excludes": pass = Array.isArray(actual) ? !actual.some((entry) => deepEqual(entry, check.value)) : !(typeof actual === "string" && actual.includes(String(check.value))); break;
		case "lengthEquals": pass = Array.isArray(actual) && actual.length === check.value; break;
		case "lte": pass = typeof actual === "number" && actual <= Number(check.value); break;
		case "gte": pass = typeof actual === "number" && actual >= Number(check.value); break;
		case "sseIncludes": pass = sseTexts(obs).some((text) => new RegExp(String(check.value)).test(text)); break;
		case "sseExcludes": pass = !sseTexts(obs).some((text) => new RegExp(String(check.value)).test(text)); break;
		case "sseLast": {
			const texts = sseTexts(obs);
			pass = texts.length > 0 && new RegExp(String(check.value)).test(texts[texts.length - 1]);
			break;
		}
		default: pass = false;
	}
	const shown = check.op.startsWith("sse") ? (obs.client.sseTypes ?? []).slice(-6) : actual;
	return { pass, actual: shown, kind: defaultKind(check, actual), expected: check.value };
}

function trimValue(value: unknown): unknown {
	const text = JSON.stringify(value);
	if (text === undefined) return value;
	return text.length > 600 ? `${text.slice(0, 600)}…` : value;
}

export function compareObservation(obs: Observation, entries: ExpectationEntry[], cards: CardLookup): Mismatch[] {
	const out: Mismatch[] = [];
	const provider = obs.billing.servedProvider ?? obs.upstream.providers.at(-1) ?? obs.routes[0] ?? "unknown";
	const base = { layer: "e2e" as const, provider, family: obs.family, model: obs.model, surface: obs.surface, mode: obs.mode, caseId: obs.caseId };
	for (const entry of entries) {
		if (!caseMatches(entry.cases, obs.caseId)) continue;
		for (const check of entry.checks) {
			const verdict = evaluateCheck(obs, check, cards);
			for (const extra of verdict.extra ?? []) {
				out.push({ ...base, ...extra, actual: trimValue(extra.actual), source: check.source, note: [extra.note, `expectation ${entry.id}`].filter(Boolean).join("; ") });
			}
			if (verdict.pass) continue;
			out.push({
				...base,
				kind: verdict.kind,
				path: check.path,
				expected: trimValue(verdict.expected),
				actual: trimValue(verdict.actual),
				...(verdict.delta ? { delta: verdict.delta } : {}),
				source: check.source,
				note: [check.note, `expectation ${entry.id}`].filter(Boolean).join("; "),
			});
		}
	}
	return out;
}

/** Runs that fail before or during the request are harness problems, not gateway mismatches. */
export function isHarnessFailure(obs: Observation): boolean {
	return Boolean(obs.harness.error);
}
