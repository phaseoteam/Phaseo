// Purpose: Unit tests for the end-to-end harness's pure helpers (path reads, checks, expected cost, SSE parsing).
// Why: A comparator bug would silently hide or invent mismatches across every case.
// How: Small hand-built observations and price rules; no gateway modules are loaded.

import { describe, expect, it } from "vitest";
import { caseMatches, compareObservation, evaluateCheck, getPath } from "../compare";
import { expectedCost, foldUnpricedInto, ruleMatches, type CardRule } from "../expected-cost";
import type { Check, Observation } from "../types";

function observation(overrides: Partial<Observation> = {}): Observation {
	return {
		caseId: "billing.sim.chat.buffered",
		group: "billing",
		family: "text",
		surface: "chat",
		mode: "buffered",
		model: "sim/model",
		routes: ["sim:sim/model"],
		client: { status: 200, headers: { "retry-after": "7" }, contentType: "application/json", body: { usage: { prompt_tokens: 10 }, list: [1, 2, 3] }, sse: null, sseTypes: null, bytes: 10 },
		upstream: { calls: [], providers: ["sim"], count: 1 },
		side: { supabase: [], blocked: [], other: [] },
		billing: {
			charges: [3_000_000], chargeCount: 1, chargeNanos: 3_000_000, successAudits: 1, failureAudits: 0, servedProvider: "sim", byok: false,
			auditTotalNanos: 3_000_000, meters: { input_text_tokens: 1_000 }, lines: [{ meter: "input_text_tokens", quantity: 1_000, lineNanos: 3_000_000 }],
			byokBilling: null, reservations: [],
		},
		audits: [],
		attempts: [],
		harness: { error: null, notes: [], durationMs: 1 },
		...overrides,
	};
}

const RULES: CardRule[] = [
	{ meter: "input_text_tokens", unit_size: 1_000_000, price_per_unit: "3", pricing_plan: "standard", match: [] },
	{ meter: "output_text_tokens", unit_size: 1_000_000, price_per_unit: "15", pricing_plan: "standard", match: [{ path: "input_tokens", op: "lte", value: 200_000, or_group: 1 }] },
	{ meter: "output_text_tokens", unit_size: 1_000_000, price_per_unit: "22.5", pricing_plan: "standard", match: [{ path: "input_tokens", op: "gt", value: 200_000, or_group: 1 }] },
	{ meter: "input_text_tokens", unit_size: 1_000_000, price_per_unit: "1.5", pricing_plan: "batch", match: [] },
];

const assumed = { kind: "assumed" as const, reason: "unit test fixture, not a real expectation" };

describe("getPath", () => {
	it("reads dotted paths, indexes, negative indexes and length", () => {
		const value = { a: { b: [{ c: 1 }, { c: 2 }] }, "retry-after": "7" };
		expect(getPath(value, "a.b[0].c")).toBe(1);
		expect(getPath(value, "a.b[-1].c")).toBe(2);
		expect(getPath(value, "a.b.length")).toBe(2);
		expect(getPath(value, "retry-after")).toBe("7");
		expect(getPath(value, "a.missing.deep")).toBeUndefined();
	});
});

describe("caseMatches", () => {
	it("supports exact ids, lists and regexes", () => {
		expect(caseMatches("a.b", "a.b")).toBe(true);
		expect(caseMatches(["x", "a.b"], "a.b")).toBe(true);
		expect(caseMatches("re:^errors\\.[a-z-]+\\.429$", "errors.google-vertex.429")).toBe(true);
		expect(caseMatches("re:^errors\\.[a-z-]+\\.429$", "errors.openai.4290")).toBe(false);
	});
});

describe("expected cost", () => {
	it("selects rules by plan and match conditions", () => {
		expect(ruleMatches(RULES[1], { input_tokens: 100 })).toBe(true);
		expect(ruleMatches(RULES[1], { input_tokens: 300_000 })).toBe(false);
		const cost = expectedCost(RULES, { input_text_tokens: 1_000_000, output_text_tokens: 1_000_000 }, { params: { input_tokens: 300_000 } });
		expect(cost.totalNanos).toBe(3_000_000_000 + 22_500_000_000);
	});

	it("reports meters the card does not price", () => {
		const cost = expectedCost(RULES, { cached_read_text_tokens: 5 });
		expect(cost.unpricedMeters).toEqual(["cached_read_text_tokens"]);
		expect(cost.totalNanos).toBe(0);
	});

	it("folds unpriced meters into their billing meter", () => {
		expect(foldUnpricedInto(RULES, { input_text_tokens: 80, cached_read_text_tokens: 20 }, { cached_read_text_tokens: "input_text_tokens" })).toEqual({ input_text_tokens: 100 });
	});
});

describe("evaluateCheck", () => {
	it("maps failures to mismatch kinds", () => {
		const obs = observation();
		const present: Check = { path: "client.body.usage.completion_tokens", op: "present", source: assumed };
		expect(evaluateCheck(obs, present, () => RULES)).toMatchObject({ pass: false, kind: "dropped" });
		const absent: Check = { path: "client.headers.retry-after", op: "absent", source: assumed };
		expect(evaluateCheck(obs, absent, () => RULES)).toMatchObject({ pass: false, kind: "invented" });
		const status: Check = { path: "client.status", op: "equals", value: 502, kind: "error_mapping", source: assumed };
		expect(evaluateCheck(obs, status, () => RULES)).toMatchObject({ pass: false, kind: "error_mapping", actual: 200 });
	});

	it("reports billing deltas and per-meter differences", () => {
		const obs = observation();
		const check: Check = { path: "billing", op: "billing", value: { meters: { input_text_tokens: 2_000 } }, source: assumed };
		const verdict = evaluateCheck(obs, check, () => RULES);
		expect(verdict.pass).toBe(false);
		expect(verdict.kind).toBe("billing_under");
		expect(verdict.delta).toEqual({ nanos: -3_000_000 });
		expect(verdict.extra?.[0]).toMatchObject({ kind: "billing_under", path: "billing.meter.input_text_tokens", delta: { tokens: -1_000, nanos: -3_000_000, meter: "input_text_tokens" } });
	});

	it("applies a fee factor without per-meter comparison", () => {
		const obs = observation({ billing: { ...observation().billing, charges: [150_000], chargeNanos: 150_000, meters: { requests: 1 } } });
		const check: Check = { path: "billing", op: "billing", value: { meters: { input_text_tokens: 2_000 }, factor: 0.025 }, source: assumed };
		const verdict = evaluateCheck(obs, check, () => RULES);
		expect(verdict).toMatchObject({ pass: true, expected: 150_000 });
		expect(verdict.extra).toEqual([]);
	});

	it("checks SSE frames", () => {
		const obs = observation({ client: { ...observation().client, sse: [{ event: null, data: { choices: [{ delta: { content: "x" } }] } }, { event: null, data: { error: { message: "boom" } } }], sseTypes: ["chunk:content", "error"] } });
		expect(evaluateCheck(obs, { path: "client.sse", op: "sseIncludes", value: "\"error\"", source: assumed }, () => null).pass).toBe(true);
		expect(evaluateCheck(obs, { path: "client.sse", op: "sseExcludes", value: "\\[DONE\\]", source: assumed }, () => null).pass).toBe(true);
		expect(evaluateCheck(obs, { path: "client.sse", op: "sseLast", value: "boom", source: assumed }, () => null).pass).toBe(true);
	});
});

describe("compareObservation", () => {
	it("emits e2e mismatches only for entries that match the case", () => {
		const obs = observation();
		const mismatches = compareObservation(obs, [
			{ id: "applies", cases: "re:^billing\\.", checks: [{ path: "client.status", op: "equals", value: 201, source: assumed }] },
			{ id: "skipped", cases: "errors.x", checks: [{ path: "client.status", op: "equals", value: 500, source: assumed }] },
		], () => RULES);
		expect(mismatches).toHaveLength(1);
		expect(mismatches[0]).toMatchObject({ layer: "e2e", kind: "wrong_value", provider: "sim", caseId: obs.caseId, path: "client.status", expected: 201, actual: 200 });
		expect(mismatches[0].note).toContain("expectation applies");
	});
});
