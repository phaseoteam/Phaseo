// Purpose: All-routes pricing sweep: every active catalogue route, every price card, every meter, plan, condition
//          branch and time window, priced by the gateway and by an independent oracle.
// Why: Billing defects and bad catalogue rows only show when every card is exercised, not a sample.
//   npx vitest run --config tools/provider-simulator/vitest.config.ts tools/provider-simulator/pricing/pricing.sim.ts
//   SIM_PROVIDERS=anthropic,openai  restricts providers; SIM_RESULTS_DIR moves results; SIM_PRICING_NOW sets the clock.
// How: Builds cases per card (pricing/cases.ts), writes expectations/pricing/<provider>.json (rule ids and expected
//      nanos), runs calculatePricing, and writes results/pricing/mismatches.json, SUMMARY.md and coverage.json.
//      Mismatches never fail the run (the central gate judges them); harness errors do.

import { expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Mismatch } from "../src/expect/types";
import { setupSimulatorRuntime, teardownSimulatorRuntime } from "../src/env";
import { expectedBill, type ExpectedBill } from "./calculator";
import { buildCases, calcRules, type PricingCase } from "./cases";
import { loadActiveRoutes, loadSweepCard, SWEEP_NOW_ISO, SWEEP_NOW_MS, type SweepCard } from "./catalogue-cards";
import { compare, loadEngine, runEngine } from "./evaluate";
import { checkCard, checkMissingCard, conditionGap, overlapMismatch, THINKING_MODE_PRICING } from "./sanity";
import { writeMultiplier } from "../src/expect/text";
import { coverageJson, renderSummary, type CardCoverage, type SweepTotals } from "./summary";

const here = path.dirname(fileURLToPath(import.meta.url));
const SIM_ROOT = path.resolve(here, "..");

/**
 * Alibaba's implicit and explicit context caches are exclusive: a hit is explicit only when the request marked
 * the prompt with cache_control (or the response reports a cache write), otherwise it is an implicit hit
 * (https://www.alibabacloud.com/help/en/model-studio/context-cache). The calculator prices what the docs say.
 */
function documentedCacheUsage(card: SweepCard, entry: PricingCase): PricingCase["usage"] {
	const usage = entry.usage as Record<string, number>;
	if (!/^alibaba/.test(card.providerId) || !(usage.cached_read_text_tokens > 0)) return entry.usage;
	const explicit = Boolean(entry.body.cache_control) || Object.keys(usage).some((meter) => meter.startsWith("cached_write_") && usage[meter] > 0);
	if (explicit) return entry.usage;
	const { cached_read_text_tokens: read, ...rest } = usage;
	return { ...rest, implicit_cached_input_text_tokens: (rest.implicit_cached_input_text_tokens ?? 0) + read } as PricingCase["usage"];
}

function calcContext(entry: PricingCase): Record<string, unknown> {
	const ttl = (entry.body.cache_control as any)?.ttl;
	return { ...entry.context, ...(typeof ttl === "string" ? { cache_ttl: ttl.toLowerCase() } : {}) };
}

function coverageFor(card: SweepCard, unreachable: CardCoverage["unreachable"]): CardCoverage {
	const coverage: CardCoverage = {
		key: card.key,
		provider: card.providerId,
		capability: card.capability,
		rules: card.rules.length,
		rulesExercised: new Set(),
		meters: new Map(),
		branches: new Map(),
		plans: new Map(),
		windows: new Map(),
		unreachable,
		cases: 0,
		casesByKind: {},
	};
	for (const rule of card.rules) {
		coverage.meters.set(`${rule.pricing_plan}|${rule.meter}`, false);
		coverage.plans.set(rule.pricing_plan, false);
		if ((rule.match ?? []).length) coverage.branches.set(`${rule.pricing_plan}|${rule.meter}|${JSON.stringify(rule.match)}`, false);
		for (const window of rule.time_windows ?? []) coverage.windows.set(`${rule.id}|${window.label}`, false);
	}
	return coverage;
}

function markCoverage(coverage: CardCoverage, card: SweepCard, bill: ExpectedBill) {
	const byId = new Map(card.rules.map((rule) => [String(rule.id), rule]));
	for (const line of bill.lines) {
		const rule = line.ruleId ? byId.get(line.ruleId) : undefined;
		if (!rule) continue;
		coverage.rulesExercised.add(String(rule.id));
		coverage.meters.set(`${rule.pricing_plan}|${rule.meter}`, true);
		coverage.plans.set(rule.pricing_plan, true);
		if ((rule.match ?? []).length) coverage.branches.set(`${rule.pricing_plan}|${rule.meter}|${JSON.stringify(rule.match)}`, true);
		if (line.window) coverage.windows.set(`${rule.id}|${line.window}`, true);
	}
}

// ---------------------------------------------------------------------------
// Reviewable expectations: one file per provider, cards sorted, one rule or case per line.

function ruleLine(rule: SweepCard["rules"][number]): string {
	return JSON.stringify([rule.id, rule.pricing_plan, rule.meter, `${rule.price_per_unit}/${rule.unit_size} ${rule.unit}`, rule.priority, rule.match?.length ? rule.match : null, (rule.time_windows ?? []).length ? rule.time_windows : null, rule.included_quantity || null]);
}

/** Unpriced meters worth showing: those with a fallback chain or a card rule elsewhere (not plain aggregates). */
function gapsOf(bill: ExpectedBill) {
	return bill.unpriced.filter((u) => u.reason !== "the card does not price this meter");
}

function caseLine(entry: PricingCase, bill: ExpectedBill): string {
	return JSON.stringify({
		id: entry.id,
		kind: entry.kind,
		targets: entry.targets.length ? entry.targets : undefined,
		plan: entry.plan,
		body: Object.keys(entry.body).length > 1 ? entry.body : undefined,
		context: Object.keys(entry.context).length ? entry.context : undefined,
		at: entry.timestampMs !== SWEEP_NOW_MS ? new Date(entry.timestampMs).toISOString() : undefined,
		usage: entry.usage,
		reportAs: entry.reportAs,
		ir: entry.irUsage,
		expected: {
			nanos: bill.nanos,
			lines: bill.lines.map((line) => [line.meter, line.quantity, line.ruleId, line.pricedAs, line.nanos, ...(line.fallback ? [line.fallback] : []), ...(line.window ? [`window:${line.window}`] : [])]),
			...(gapsOf(bill).length ? { unpriced: gapsOf(bill).map((u) => `${u.meter}=${u.quantity}`) } : {}),
		},
		source: entry.source,
	});
}

type ProviderExpectations = Array<{ card: SweepCard; unreachable: CardCoverage["unreachable"]; cases: Array<{ entry: PricingCase; bill: ExpectedBill }> }>;

function writeExpectations(dir: string, provider: string, cards: ProviderExpectations) {
	const out: string[] = ["{"];
	out.push(`\t"provider": ${JSON.stringify(provider)},`);
	out.push(`\t"generatedBy": "tools/provider-simulator/pricing/pricing.sim.ts from packages/data/catalog/src/data",`);
	out.push(`\t"clock": ${JSON.stringify(SWEEP_NOW_ISO)},`);
	out.push(`\t"legend": { "rules": "[id, plan, meter, price/unit_size unit, priority, match, time_windows, included_quantity]", "expected.lines": "[meter, quantity, rule id, priced as meter, nanos, fallback?, window?]" },`);
	out.push(`\t"cards": [`);
	cards.sort((a, b) => a.card.key.localeCompare(b.card.key)).forEach(({ card, unreachable, cases }, cardIndex) => {
		out.push("\t\t{");
		out.push(`\t\t\t"key": ${JSON.stringify(card.key)},`);
		out.push(`\t\t\t"file": ${JSON.stringify(card.file)},`);
		out.push(`\t\t\t"rules": [`);
		card.rules.forEach((rule, i) => out.push(`\t\t\t\t${ruleLine(rule)}${i < card.rules.length - 1 ? "," : ""}`));
		out.push("\t\t\t],");
		if (unreachable.length) out.push(`\t\t\t"unreachable": ${JSON.stringify(unreachable)},`);
		out.push(`\t\t\t"cases": [`);
		cases.forEach(({ entry, bill }, i) => out.push(`\t\t\t\t${caseLine(entry, bill)}${i < cases.length - 1 ? "," : ""}`));
		out.push("\t\t\t]");
		out.push(`\t\t}${cardIndex < cards.length - 1 ? "," : ""}`);
	});
	out.push("\t]", "}");
	fs.writeFileSync(path.join(dir, `${provider}.json`), `${out.join("\n")}\n`);
}

// ---------------------------------------------------------------------------

it("prices every active route against an independent oracle", async () => {
	const started = Date.now();
	setupSimulatorRuntime();
	const engine = await loadEngine();
	const resultsDir = path.join(process.env.SIM_RESULTS_DIR ?? path.join(SIM_ROOT, "results"), "pricing");
	const expectationsDir = path.join(SIM_ROOT, "expectations", "pricing");
	fs.mkdirSync(resultsDir, { recursive: true });
	fs.mkdirSync(expectationsDir, { recursive: true });

	const only = process.env.SIM_PROVIDERS?.split(",").map((id) => id.trim()).filter(Boolean);
	const routes = loadActiveRoutes().filter((route) => !only?.length || only.includes(route.providerId));
	expect(routes.length, "no active catalogue routes found: the fixture layout has changed").toBeGreaterThan(0);

	const mismatches: Mismatch[] = [];
	const totals: SweepTotals = {
		routes: routes.length,
		routesByCapability: {},
		noCard: [],
		noCurrentRules: [],
		cards: [],
		documented: { cases: 0, overNanos: 0, underNanos: 0, errorNanos: 0, errors: 0, over: 0, under: 0 },
		calculatorErrors: [],
		engineErrors: {},
		durationMs: 0,
		now: SWEEP_NOW_ISO,
	};
	const byProvider = new Map<string, ProviderExpectations>();
	const gaps = new Set<string>();

	for (const route of routes) {
		const cap = (totals.routesByCapability[route.capability] ??= { active: 0, withCard: 0, withCurrentRules: 0 });
		cap.active += 1;
		const card = loadSweepCard(route.providerId, route.apiModelId, route.capability);
		if (!card) {
			totals.noCard.push(route.key);
			mismatches.push(checkMissingCard(route));
			continue;
		}
		cap.withCard += 1;
		mismatches.push(...checkCard(card, route));
		if (!card.rules.length) {
			totals.noCurrentRules.push(route.key);
			continue;
		}
		cap.withCurrentRules += 1;

		const { cases, unreachable, overlaps } = buildCases(card, route);
		for (const overlap of overlaps) {
			const mismatch = overlapMismatch(card, overlap);
			if (mismatch) mismatches.push(mismatch);
		}
		const coverage = coverageFor(card, unreachable);
		const rules = calcRules(card);
		const evaluated: ProviderExpectations[number]["cases"] = [];
		for (const entry of cases) {
			let bill: ExpectedBill;
			try {
				bill = expectedBill({
					rules,
					usage: documentedCacheUsage(card, entry),
					context: calcContext(entry),
					plan: entry.plan,
					timestampMs: entry.timestampMs,
					thinkingModeBillsAnswer: THINKING_MODE_PRICING[card.providerId],
					writeInputMultiplier: (ttl) => writeMultiplier(card.providerId, ttl, card.apiModelId),
				});
			} catch (error) {
				totals.calculatorErrors.push(`${card.key} ${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
				continue;
			}
			// A meter the card prices that this request leaves without a rule (unpriced, or priced only by a fallback).
			const cardMeters = new Set<string>(card.rules.map((rule) => rule.meter));
			const gapMeters = [...bill.unpriced.map((u) => u.meter), ...bill.lines.filter((line) => line.fallback && line.pricedAs !== "output_reasoning_tokens").map((line) => line.meter)];
			for (const meter of gapMeters) {
				const gapKey = `${card.key}|${meter}`;
				if (cardMeters.has(meter) && !gaps.has(gapKey)) {
					gaps.add(gapKey);
					mismatches.push(conditionGap(card, entry.id, meter, { ...calcContext(entry), input_tokens: entry.usage.input_tokens }));
				}
			}
			coverage.cases += 1;
			coverage.casesByKind[entry.kind] = (coverage.casesByKind[entry.kind] ?? 0) + 1;
			markCoverage(coverage, card, bill);
			evaluated.push({ entry, bill });

			const actual = runEngine(card, entry, engine);
			if (actual.ok === false) {
				const key = actual.error.replace(/:.*/, "");
				totals.engineErrors[key] = (totals.engineErrors[key] ?? 0) + 1;
			}
			const result = compare(card, entry, bill, actual);
			mismatches.push(...result.mismatches);
			if (entry.kind === "documented") {
				const d = totals.documented;
				d.cases += 1;
				if (result.errored) {
					d.errors += 1;
					d.errorNanos += result.deltaNanos;
				} else if (result.deltaNanos > 0) {
					d.over += 1;
					d.overNanos += result.deltaNanos;
				} else if (result.deltaNanos < 0) {
					d.under += 1;
					d.underNanos += result.deltaNanos;
				}
			}
		}
		totals.cards.push(coverage);
		const list = byProvider.get(card.providerId) ?? [];
		list.push({ card, unreachable, cases: evaluated });
		byProvider.set(card.providerId, list);
	}

	if (!only?.length) {
		for (const file of fs.readdirSync(expectationsDir)) if (file.endsWith(".json")) fs.rmSync(path.join(expectationsDir, file));
	}
	for (const [provider, cards] of [...byProvider.entries()].sort((a, b) => a[0].localeCompare(b[0]))) writeExpectations(expectationsDir, provider, cards);

	mismatches.sort((a, b) =>
		a.provider.localeCompare(b.provider) ||
		String(a.model).localeCompare(String(b.model)) ||
		String(a.surface).localeCompare(String(b.surface)) ||
		a.caseId.localeCompare(b.caseId) ||
		a.path.localeCompare(b.path));
	totals.durationMs = Date.now() - started;
	fs.writeFileSync(path.join(resultsDir, "mismatches.json"), `${JSON.stringify(mismatches, null, 1)}\n`);
	fs.writeFileSync(path.join(resultsDir, "SUMMARY.md"), renderSummary(totals, mismatches));
	fs.writeFileSync(path.join(resultsDir, "coverage.json"), `${JSON.stringify(coverageJson(totals), null, 1)}
`);
	teardownSimulatorRuntime();

	// Harness check only: cards were found and priced. Mismatches are judged by the central gate.
	expect(totals.cards.length + totals.noCard.length + totals.noCurrentRules.length, "no routes were swept").toBe(routes.length);
	expect(totals.cards.some((card) => card.cases > 0), "no case was priced").toBe(true);
}, 30 * 60_000);
