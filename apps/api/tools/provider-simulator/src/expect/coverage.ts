// Purpose: One coverage report across the executor, end-to-end and pricing layers.
// Why: "Run everything" needs proof of what was exercised, and an explicit list of what was not and why.
// How: Counts registered executors (executors/index.ts), catalogue routes, documented parameters and price meters,
//      and compares them with what each layer's results record.

import fs from "node:fs";
import path from "node:path";
import { EXECUTORS_BY_PROVIDER } from "@executors/index";
import { loadCatalogueRoutes } from "../catalogue";
import { buildClientMatrix } from "../client-requests";

function readJson(file: string): any {
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

function pct(part: number, whole: number) {
	return whole ? `${part}/${whole} (${Math.round((part / whole) * 100)}%)` : `${part}/0`;
}

export function writeCoverage(resultsDir: string) {
	const lines: string[] = ["# Coverage", ""];
	// Executors by capability.
	const registered = new Map<string, Set<string>>();
	for (const [provider, capabilities] of Object.entries(EXECUTORS_BY_PROVIDER)) {
		for (const capability of Object.keys(capabilities)) {
			registered.set(capability, (registered.get(capability) ?? new Set()).add(provider));
		}
	}
	const providerFiles = fs.existsSync(path.join(resultsDir, "providers")) ? fs.readdirSync(path.join(resultsDir, "providers")).filter((file) => file.endsWith(".json")) : [];
	const executorResults = providerFiles.map((file) => readJson(path.join(resultsDir, "providers", file)));
	const textExercised = new Set<string>();
	for (const result of executorResults) for (const id of result?.registeredIds ?? []) if (result.routes?.some((route: any) => route.requests?.some((request: any) => request.outcome === "sent"))) textExercised.add(id);
	const e2e = readJson(path.join(resultsDir, "e2e", "coverage.json"));
	const e2ePairs = new Map<string, Set<string>>();
	for (const pair of e2e?.pairs ?? []) e2ePairs.set(pair.capability, (e2ePairs.get(pair.capability) ?? new Set()).add(pair.provider));
	lines.push("## Executors (registered provider ids per capability in executors/index.ts)", "");
	lines.push("| Capability | Registered | Exercised (executor layer) | Exercised (end-to-end) |");
	lines.push("|---|---|---|---|");
	for (const [capability, providers] of Array.from(registered).sort()) {
		const executorLayer = capability === "text.generate" ? Array.from(providers).filter((id) => textExercised.has(id)).length : 0;
		const endToEnd = Array.from(providers).filter((id) => e2ePairs.get(capability)?.has(id)).length;
		lines.push(`| ${capability} | ${providers.size} | ${capability === "text.generate" ? pct(executorLayer, providers.size) : "–"} | ${pct(endToEnd, providers.size)} |`);
	}
	const missingText = Array.from(registered.get("text.generate") ?? []).filter((id) => !textExercised.has(id));
	if (missingText.length) lines.push("", `Text executors with no upstream request in the executor layer: ${missingText.join(", ")} (see results/MATRIX.md for each error).`);

	// Catalogue routes.
	const routes = loadCatalogueRoutes();
	let active = 0;
	let sampled = 0;
	for (const [provider, list] of routes) {
		const result = executorResults.find((entry) => entry?.providerId === provider);
		active += list.filter((route) => route.active).length;
		sampled += (result?.routes ?? []).filter((route: any) => route.active).length;
	}
	const pricing = readJson(path.join(resultsDir, "pricing", "coverage.json"));
	lines.push("", "## Catalogue routes and price cards", "");
	lines.push(`- Active text routes driven through their executor (up to three per provider, one per model family): ${pct(sampled, active)}.`);
	if (pricing) {
		lines.push(`- Active routes (all capabilities) with a price card: ${pct(pricing.activeRoutesWithCard, pricing.activeRoutes)}; cards exercised by the pricing sweep: ${pct(pricing.cardsExercised, pricing.cards)}.`);
		lines.push(`- Price meters exercised: ${pct(pricing.metersExercised, pricing.metersPresent)}; condition branches (tiers, resolutions, windows): ${pct(pricing.conditionBranchesExercised, pricing.conditionBranchesPresent)}.`);
		lines.push("", "| Capability | Cards | Exercised | Meters | Exercised |", "|---|---|---|---|---|");
		for (const [capability, entry] of Object.entries<any>(pricing.byCapability ?? {})) lines.push(`| ${capability} | ${entry.cards} | ${entry.cardsExercised} | ${entry.metersPresent} | ${entry.metersExercised} |`);
	} else {
		lines.push("- Pricing sweep results not found (results/pricing/coverage.json).");
	}

	// Documented parameters.
	const matrix = buildClientMatrix();
	lines.push("", "## Documented request parameters (apps/docs/openapi/v1/openapi.yaml)", "");
	lines.push("| Surface | Documented | Reached an upstream provider for at least one route | Never reached (all routes rejected or dropped) |");
	lines.push("|---|---|---|---|");
	for (const [surface, coverage] of Object.entries(matrix.coverage)) {
		const reached = new Set<string>();
		for (const result of executorResults) for (const route of result?.routes ?? []) for (const request of route.requests ?? []) {
			if (request.surface === surface && request.kind === "param" && request.outcome === "sent" && request.effect === "changed") reached.add(request.param);
		}
		const never = coverage.documented.filter((param) => !reached.has(param));
		lines.push(`| ${surface} | ${coverage.documented.length} | ${pct(coverage.documented.length - never.length, coverage.documented.length)} | ${never.join(", ") || "–"} |`);
	}
	lines.push("", "Gateway-only parameters (`session_id`, `usage`, `meta`, `echo_upstream_request`, `debug`) are expected never to reach a provider.");

	// Scenario volume.
	const counts = new Map<string, number>();
	for (const scenario of matrix.scenarios) counts.set(scenario.kind, (counts.get(scenario.kind) ?? 0) + 1);
	lines.push("", "## Executor-layer cases per route", "");
	lines.push(`Client scenarios: ${matrix.scenarios.length} (${Array.from(counts).map(([kind, n]) => `${kind} ${n}`).join(", ")}), plus BYOK on each surface, a tool-loop round trip per surface, and response variants (text, max usage, four finish reasons, refusal, mid-stream error) on each surface in both modes; HTTP error variants on chat.`);

	// Not covered.
	const notCovered = [
		...(e2e?.notCovered ?? []),
		...(pricing?.notCovered ?? []),
		{ what: "Executor layer: presets, guardrails, the auto-router, candidate ranking and sticky reads", reason: "they need the database; the end-to-end layer covers what it can with module mocks" },
		{ what: "Executor layer: routes beyond three per provider", reason: "routes of one provider share one executor and request mapping; every active route is still priced in the pricing sweep" },
	];
	lines.push("", "## Not covered", "");
	for (const entry of notCovered) lines.push(`- **${entry.what}**: ${entry.reason}`);
	fs.writeFileSync(path.join(resultsDir, "COVERAGE.md"), `${lines.join("\n")}\n`);
}
