// Purpose: Collect mismatches from every layer, apply the allow-list, write the expectations report and decide pass/fail.
// Why: One gate for executor, end-to-end and pricing layers, so a regression anywhere fails the run.
// How: Reads results/providers/*.json (executor layer), results/e2e/mismatches.json and results/pricing/mismatches.json,
//      groups identical mismatches across providers, and writes results/EXPECTATIONS.md and results/gate.json.

import fs from "node:fs";
import path from "node:path";
import { applyAllowlist, loadAllowlist } from "./allowlist";
import type { GateSummary, Mismatch } from "./types";

export type GateResult = { summary: GateSummary; mismatches: Mismatch[] };

function readJson(file: string): any {
	return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

export function collectMismatches(resultsDir: string): Mismatch[] {
	const out: Mismatch[] = [];
	const providersDir = path.join(resultsDir, "providers");
	if (fs.existsSync(providersDir)) {
		for (const file of fs.readdirSync(providersDir).filter((name) => name.endsWith(".json"))) {
			const result = readJson(path.join(providersDir, file));
			for (const route of result?.routes ?? []) out.push(...(route.mismatches ?? []));
		}
	}
	for (const layer of ["e2e", "pricing"]) {
		const list = readJson(path.join(resultsDir, layer, "mismatches.json"));
		if (Array.isArray(list)) out.push(...list);
	}
	return out;
}

/** Groups mismatches that share everything but the provider and model, so one defect reads as one line. */
export function groupMismatches(mismatches: Mismatch[]) {
	const groups = new Map<string, { sample: Mismatch; providers: Set<string>; count: number; nanos: number; tokens: number }>();
	for (const mismatch of mismatches) {
		const key = [mismatch.layer, mismatch.kind, mismatch.family, mismatch.surface ?? "", mismatch.mode ?? "", mismatch.caseId.replace(/\d{2,}/g, "N"), mismatch.path, mismatch.allowed?.id ?? ""].join("|");
		const group = groups.get(key) ?? { sample: mismatch, providers: new Set<string>(), count: 0, nanos: 0, tokens: 0 };
		group.providers.add(mismatch.provider);
		group.count += 1;
		group.nanos += mismatch.delta?.nanos ?? 0;
		group.tokens += mismatch.delta?.tokens ?? 0;
		groups.set(key, group);
	}
	return Array.from(groups.values()).sort((a, b) => b.providers.size - a.providers.size || b.count - a.count);
}

function sourceLabel(mismatch: Mismatch): string {
	const source = mismatch.source as any;
	switch (source?.kind) {
		case "spec": return `spec ${source.spec} ${source.path}`;
		case "docs": return source.url;
		case "gateway-docs": return source.page;
		case "assumed": return `assumed: ${source.reason}`;
		default: return JSON.stringify(source);
	}
}

function md(value: unknown, max = 80): string {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	return String(text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, max);
}

export function runGate(resultsDir: string): GateResult {
	const mismatches = collectMismatches(resultsDir);
	const summary = applyAllowlist(mismatches, loadAllowlist());
	const groups = groupMismatches(mismatches);
	const lines: string[] = [];
	lines.push("# Expected-outcome gate");
	lines.push("");
	lines.push(`Mismatches: ${summary.total}. Allowed by the allow-list: ${summary.allowed}. **Failing: ${summary.failing}.**`);
	lines.push("");
	lines.push("| Kind | Total | Failing |");
	lines.push("|---|---|---|");
	for (const [kind, counts] of Object.entries(summary.byKind)) lines.push(`| ${kind} | ${counts.total} | ${counts.failing} |`);
	const byLayer = new Map<string, { total: number; failing: number }>();
	for (const mismatch of mismatches) {
		const entry = byLayer.get(mismatch.layer) ?? { total: 0, failing: 0 };
		entry.total += 1;
		if (!mismatch.allowed) entry.failing += 1;
		byLayer.set(mismatch.layer, entry);
	}
	lines.push("");
	lines.push("| Layer | Total | Failing |");
	lines.push("|---|---|---|");
	for (const [layer, counts] of byLayer) lines.push(`| ${layer} | ${counts.total} | ${counts.failing} |`);
	const billing = mismatches.filter((mismatch) => mismatch.kind === "billing_over" || mismatch.kind === "billing_under");
	const sumNanos = (list: Mismatch[]) => list.reduce((sum, mismatch) => sum + (mismatch.delta?.nanos ?? 0), 0);
	lines.push("");
	lines.push(`Billing deltas over all simulated responses: over ${(sumNanos(billing.filter((m) => m.kind === "billing_over")) / 1e9).toFixed(4)} USD, under ${(sumNanos(billing.filter((m) => m.kind === "billing_under")) / 1e9).toFixed(4)} USD (sentinel usage of about 128k tokens per response; see AUDIT.md for per-request impact).`);
	const section = (title: string, list: ReturnType<typeof groupMismatches>, limit: number) => {
		lines.push("");
		lines.push(`## ${title} (${list.length} groups)`);
		lines.push("");
		lines.push("| Kind | Layer | Surface/mode | Case | Path | Providers | Expected | Actual | Δ nanos | Source | Allow-list |");
		lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
		for (const group of list.slice(0, limit)) {
			const m = group.sample;
			const providers = Array.from(group.providers);
			lines.push(`| ${m.kind} | ${m.layer} | ${[m.surface, m.mode].filter(Boolean).join("/")} | ${md(m.caseId, 40)} | ${md(m.path, 60)} | ${providers.length}: ${md(providers.slice(0, 6).join(", "), 70)}${providers.length > 6 ? ", …" : ""} | ${md(m.expected, 50)} | ${md(m.actual, 50)} | ${group.nanos || ""} | ${md(sourceLabel(m), 70)} | ${m.allowed?.id ?? "**none**"} |`);
		}
		if (list.length > limit) lines.push(`\n… ${list.length - limit} more groups in results/gate.json.`);
	};
	section("Failing", groups.filter((group) => !group.sample.allowed), 400);
	section("Allowed", groups.filter((group) => group.sample.allowed), 300);
	lines.push("");
	lines.push("## Allow-list use");
	lines.push("");
	for (const [id, count] of Object.entries(summary.byAllowEntry).sort((a, b) => b[1] - a[1])) lines.push(`- \`${id}\`: ${count}`);
	if (summary.unusedAllowEntries.length) lines.push(`- Unused entries (remove when the fix lands): ${summary.unusedAllowEntries.map((id) => `\`${id}\``).join(", ")}`);
	fs.writeFileSync(path.join(resultsDir, "EXPECTATIONS.md"), `${lines.join("\n")}\n`);
	fs.writeFileSync(path.join(resultsDir, "gate.json"), `${JSON.stringify({
		summary,
		groups: groups.map((group) => ({ ...group.sample, providers: Array.from(group.providers), count: group.count, nanos: group.nanos, tokens: group.tokens })),
	}, null, 1)}\n`);
	return { summary, mismatches };
}
