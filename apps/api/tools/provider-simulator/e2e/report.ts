// Purpose: Write the end-to-end results: trimmed observations, mismatches and a short summary.
// Why: The central allow-list gate reads mismatches.json; reviewers read SUMMARY.md.
// How: Observations are trimmed (SSE frames capped, large bodies previewed); the summary counts mismatches by kind.

import fs from "node:fs";
import path from "node:path";
import { MISMATCH_KINDS, type Mismatch } from "../src/expect/types";
import type { CaseDef, Observation } from "./types";

const MAX_SSE_FRAMES = 40;
const MAX_BODY_CHARS = 3_000;
/** Bulky diagnostics that every case repeats; they are dropped from the written observations only. */
const PRUNED_KEYS = new Set(["routing_diagnostics", "pricing_lines", "server-timing", "billing_timestamp_ms", "billing_timestamp_iso", "billing_timestamp_basis", "billing_timestamp_basis_configured", "pricing_time_window", "meta"]);

function prune(value: unknown, depth = 0): unknown {
	if (depth > 12 || value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map((entry) => prune(entry, depth + 1));
	return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !PRUNED_KEYS.has(key)).map(([key, entry]) => [key, prune(entry, depth + 1)]));
}

function capped(value: unknown): unknown {
	const pruned = prune(value);
	const text = JSON.stringify(pruned);
	if (text === undefined || text.length <= MAX_BODY_CHARS) return pruned;
	return { __truncated: true, chars: text.length, preview: text.slice(0, MAX_BODY_CHARS) };
}

function trimObservation(obs: Observation): Observation {
	const sse = obs.client.sse;
	const frames = sse && sse.length > MAX_SSE_FRAMES ? [...sse.slice(0, MAX_SSE_FRAMES / 2), { event: "…", data: `${sse.length - MAX_SSE_FRAMES} frames omitted` }, ...sse.slice(-MAX_SSE_FRAMES / 2)] : sse;
	return {
		...obs,
		client: {
			...obs.client,
			headers: prune(obs.client.headers) as Record<string, string>,
			body: capped(obs.client.body),
			sse: frames ? frames.map((frame) => ({ event: frame.event, data: capped(frame.data) })) : frames,
		},
		upstream: { ...obs.upstream, calls: obs.upstream.calls.map((call) => ({ ...call, body: capped(call.body) })) },
	};
}

function table(rows: string[][]): string {
	if (!rows.length) return "";
	const [head, ...body] = rows;
	return [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function oneLine(value: unknown): string {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	if (text === undefined) return "";
	const flat = text.replace(/\s+/g, " ").replace(/\|/g, "\\|");
	return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

export type CoverageReport = {
	pairs: Array<{ provider: string; capability: string; endpoint: string; cases: string[] }>;
	families: Record<string, { registeredProviders: number; exercisedProviders: number }>;
	notCovered: Array<{ what: string; reason: string }>;
};

/**
 * Provider x capability pairs that received at least one upstream call, against the executor registry.
 * `registry` is EXECUTORS_BY_PROVIDER (provider -> capability -> executor).
 */
export function buildCoverage(args: {
	cases: CaseDef[];
	observations: Observation[];
	registry: Record<string, Record<string, unknown>>;
	notCovered: Array<{ area: string; reason: string }>;
}): CoverageReport {
	const capabilityOf = new Map(args.cases.map((def) => [def.id, { capability: def.capability, endpoint: def.endpoint }]));
	const pairs = new Map<string, { provider: string; capability: string; endpoint: string; cases: string[] }>();
	for (const obs of args.observations) {
		const target = capabilityOf.get(obs.caseId);
		if (!target) continue;
		for (const provider of new Set(obs.upstream.providers)) {
			const key = `${provider}|${target.capability}|${target.endpoint}`;
			const entry = pairs.get(key) ?? { provider, capability: target.capability, endpoint: target.endpoint, cases: [] };
			entry.cases.push(obs.caseId);
			pairs.set(key, entry);
		}
	}
	const registered = new Map<string, number>();
	for (const capabilities of Object.values(args.registry)) {
		for (const capability of Object.keys(capabilities ?? {})) registered.set(capability, (registered.get(capability) ?? 0) + 1);
	}
	const exercised = new Map<string, Set<string>>();
	for (const pair of pairs.values()) {
		const set = exercised.get(pair.capability) ?? new Set<string>();
		set.add(pair.provider);
		exercised.set(pair.capability, set);
	}
	const families: CoverageReport["families"] = {};
	for (const capability of [...new Set([...registered.keys(), ...exercised.keys()])].sort()) {
		families[capability] = { registeredProviders: registered.get(capability) ?? 0, exercisedProviders: exercised.get(capability)?.size ?? 0 };
	}
	return {
		pairs: [...pairs.values()].sort((a, b) => a.capability.localeCompare(b.capability) || a.provider.localeCompare(b.provider) || a.endpoint.localeCompare(b.endpoint)),
		families,
		notCovered: args.notCovered.map((entry) => ({ what: entry.area, reason: entry.reason })),
	};
}

export function writeE2eReports(args: {
	resultsDir: string;
	cases: CaseDef[];
	observations: Observation[];
	mismatches: Mismatch[];
	notCovered: Array<{ area: string; reason: string }>;
	missingResets: string[];
	harnessErrors: string[];
	filtered: boolean;
	coverage?: CoverageReport;
	staleKvWrites?: number;
}) {
	fs.mkdirSync(args.resultsDir, { recursive: true });
	fs.writeFileSync(path.join(args.resultsDir, "observations.json"), `${JSON.stringify(args.observations.map(trimObservation), null, 2)}\n`);
	fs.writeFileSync(path.join(args.resultsDir, "mismatches.json"), `${JSON.stringify(args.mismatches, null, 2)}\n`);
	if (args.coverage) fs.writeFileSync(path.join(args.resultsDir, "coverage.json"), `${JSON.stringify(args.coverage, null, 2)}\n`);

	const byKind = Object.fromEntries(MISMATCH_KINDS.map((kind) => [kind, 0])) as Record<string, number>;
	for (const mismatch of args.mismatches) byKind[mismatch.kind] = (byKind[mismatch.kind] ?? 0) + 1;
	const byGroup = new Map<string, { cases: number; withMismatch: Set<string>; mismatches: number }>();
	for (const def of args.cases) {
		const entry = byGroup.get(def.group) ?? { cases: 0, withMismatch: new Set<string>(), mismatches: 0 };
		entry.cases += 1;
		byGroup.set(def.group, entry);
	}
	for (const mismatch of args.mismatches) {
		const group = args.cases.find((def) => def.id === mismatch.caseId)?.group ?? "?";
		const entry = byGroup.get(group);
		if (!entry) continue;
		entry.mismatches += 1;
		entry.withMismatch.add(mismatch.caseId);
	}

	const lines: string[] = [];
	lines.push("# End-to-end provider simulator: summary");
	lines.push("");
	lines.push("Generated by `tools/provider-simulator/e2e/e2e.sim.ts`. Every case calls the real endpoint handler (`makeEndpointHandler` → `beforeRequest` → runner → `doRequestWithIR` → `finalizeRequest`). Only auth, gateway context, workspace policy, the price-card loader, charge persistence and audit persistence are replaced; upstream HTTP and Supabase are answered by a guarded fetch. No network was used.");
	lines.push("");
	if (args.filtered) lines.push("**Partial run:** `SIM_E2E_CASES` filtered the cases, so the counts below are not the full set.\n");
	lines.push(`- Cases run: ${args.observations.length}`);
	lines.push(`- Harness errors: ${args.harnessErrors.length}`);
	lines.push(`- Mismatches: ${args.mismatches.length} (not gated here; the allow-list is applied centrally)`);
	if (args.missingResets.length) lines.push(`- Missing test-reset exports (state may leak between cases): ${args.missingResets.join(", ")}`);
	if (args.staleKvWrites) lines.push(`- KV writes refused because they came from an earlier case's leftover work: ${args.staleKvWrites}`);
	lines.push("");
	lines.push("## Mismatches by kind");
	lines.push("");
	lines.push(table([["kind", "count"], ...Object.entries(byKind).filter(([, count]) => count > 0).map(([kind, count]) => [kind, String(count)])]));
	lines.push("");
	lines.push("## Cases by group");
	lines.push("");
	lines.push(table([["group", "cases", "cases with mismatches", "mismatches"], ...[...byGroup.entries()].map(([group, entry]) => [group, String(entry.cases), String(entry.withMismatch.size), String(entry.mismatches)])]));
	lines.push("");
	if (args.coverage) {
		lines.push("## Coverage by capability (providers with an upstream call / providers registered in executors/index.ts)");
		lines.push("");
		const exercisedFamilies = Object.entries(args.coverage.families).filter(([, entry]) => entry.exercisedProviders > 0);
		lines.push(table([["capability", "exercised", "registered", "providers"], ...exercisedFamilies.map(([capability, entry]) => [
			capability,
			String(entry.exercisedProviders),
			String(entry.registeredProviders),
			args.coverage!.pairs.filter((pair) => pair.capability === capability).map((pair) => pair.provider).filter((value, index, all) => all.indexOf(value) === index).join(", "),
		])]));
		lines.push("");
	}
	lines.push("## Cases");
	lines.push("");
	const rows: string[][] = [["case", "client", "upstream calls", "charged nanos", "mismatches"]];
	for (const obs of args.observations) {
		const count = args.mismatches.filter((mismatch) => mismatch.caseId === obs.caseId).length;
		rows.push([
			obs.caseId,
			obs.harness.error ? `harness error: ${oneLine(obs.harness.error.split("\n")[0])}` : String(obs.client.status),
			obs.upstream.calls.map((call) => `${call.provider}:${call.outcome}`).join(" → ") || "none",
			obs.billing.chargeCount ? obs.billing.charges.join(" + ") : "none",
			String(count),
		]);
	}
	lines.push(table(rows));
	lines.push("");
	if (args.harnessErrors.length) {
		lines.push("## Harness errors");
		lines.push("");
		for (const error of args.harnessErrors) lines.push(`- ${oneLine(error)}`);
		lines.push("");
	}
	lines.push("## Not covered");
	lines.push("");
	for (const entry of args.notCovered) lines.push(`- **${entry.area}.** ${entry.reason}`);
	lines.push("");
	fs.writeFileSync(path.join(args.resultsDir, "SUMMARY.md"), `${lines.join("\n")}\n`);
}
