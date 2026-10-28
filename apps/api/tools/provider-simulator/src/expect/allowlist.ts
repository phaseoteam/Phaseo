// Purpose: Apply the justified allow-list to mismatches and decide the exit status.
// Why: Known defects and intended differences must be explicit and reviewable; anything else fails the run.
// How: expectations/allowlist.json entries match mismatches by field pattern; unmatched mismatches fail.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MISMATCH_KINDS, type AllowEntry, type GateSummary, type Mismatch } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
export const EXPECTATIONS_DIR = path.resolve(here, "../../expectations");

let cached: AllowEntry[] | null = null;

export function loadAllowlist(file = path.join(EXPECTATIONS_DIR, "allowlist.json")): AllowEntry[] {
	if (cached) return cached;
	const entries = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")).entries as AllowEntry[]) : [];
	for (const entry of entries) {
		if (!entry.id || !entry.justification || entry.justification.trim().length < 20 || !entry.finding || !entry.fixGroup) {
			throw new Error(`allow-list entry ${entry.id ?? "?"} needs an id, a finding, a fix group and a justification of at least a sentence`);
		}
	}
	cached = entries;
	return entries;
}

export function resetAllowlistCache() {
	cached = null;
}

function fieldMatches(pattern: string | string[] | undefined, value: string | undefined): boolean {
	if (pattern === undefined) return true;
	const patterns = Array.isArray(pattern) ? pattern : [pattern];
	return patterns.some((entry) => {
		if (entry === "*") return true;
		if (value === undefined) return false;
		if (entry.startsWith("re:")) return new RegExp(entry.slice(3)).test(value);
		return entry === value;
	});
}

export function matchAllow(mismatch: Mismatch, entries: AllowEntry[]): AllowEntry | undefined {
	return entries.find((entry) =>
		Object.entries(entry.match).every(([key, pattern]) => fieldMatches(pattern, (mismatch as Record<string, any>)[key]?.toString())),
	);
}

export function applyAllowlist(mismatches: Mismatch[], entries = loadAllowlist()): GateSummary {
	const byKind: GateSummary["byKind"] = Object.fromEntries(MISMATCH_KINDS.map((kind) => [kind, { total: 0, failing: 0 }]));
	const byAllowEntry: Record<string, number> = {};
	let allowed = 0;
	for (const mismatch of mismatches) {
		const entry = matchAllow(mismatch, entries);
		byKind[mismatch.kind] ??= { total: 0, failing: 0 };
		byKind[mismatch.kind].total += 1;
		if (entry) {
			mismatch.allowed = { id: entry.id, justification: entry.justification };
			byAllowEntry[entry.id] = (byAllowEntry[entry.id] ?? 0) + 1;
			allowed += 1;
		} else {
			byKind[mismatch.kind].failing += 1;
		}
	}
	return {
		total: mismatches.length,
		allowed,
		failing: mismatches.length - allowed,
		byKind,
		byAllowEntry,
		unusedAllowEntries: entries.filter((entry) => !byAllowEntry[entry.id]).map((entry) => entry.id),
	};
}

/** Stable key used to compare runs and to group identical mismatches across routes. */
export function mismatchKey(mismatch: Mismatch): string {
	return [mismatch.layer, mismatch.kind, mismatch.provider, mismatch.family, mismatch.surface ?? "", mismatch.mode ?? "", mismatch.caseId, mismatch.path].join("|");
}
