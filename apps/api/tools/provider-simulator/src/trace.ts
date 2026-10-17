// Purpose: Analyse captured upstream bodies against the client request.
// Why: Prove where each client field went: forwarded, renamed, stringified, dropped or changed.
// How: Sentinel tracing for values, base-versus-variant diffs for parameter effects, and structural
//      comparisons for determinism and cacheable-prefix stability.

import { foldKey, isTraceableNumber, isTraceableString, lastKey, leaves, pathSignature, type Leaf } from "./sentinels";

export type FieldFate = {
	clientPath: string;
	value: unknown;
	fate: "forwarded" | "renamed" | "stringified" | "dropped" | "changed";
	upstreamPaths: string[];
};

const CONTENT_PATH = /^\$\.(messages|input|system|instructions|tools|prompt)\b/;

export function traceSentinels(clientBody: any, upstreamBody: any, upstreamText: string): FieldFate[] {
	const upstreamLeaves = leaves(upstreamBody);
	const byValue = new Map<string, Leaf[]>();
	for (const leaf of upstreamLeaves) {
		const key = JSON.stringify(leaf.value);
		byValue.set(key, [...(byValue.get(key) ?? []), leaf]);
	}
	const out: FieldFate[] = [];
	for (const leaf of leaves(clientBody)) {
		if (!isTraceableString(leaf.value) && !isTraceableNumber(leaf.value)) continue;
		const matches = byValue.get(JSON.stringify(leaf.value)) ?? [];
		if (matches.length) {
			const sameKey = matches.some((match) => foldKey(lastKey(match.path)) === foldKey(lastKey(leaf.path)));
			out.push({ clientPath: leaf.path, value: leaf.value, fate: sameKey || CONTENT_PATH.test(leaf.path) ? "forwarded" : "renamed", upstreamPaths: matches.map((m) => m.path).slice(0, 4) });
			continue;
		}
		if (typeof leaf.value === "string" && upstreamText.includes(JSON.stringify(leaf.value).slice(1, -1))) {
			out.push({ clientPath: leaf.path, value: leaf.value, fate: "stringified", upstreamPaths: [] });
			continue;
		}
		// A JSON string (tool-call arguments) is often sent upstream parsed: trace the values inside it.
		const parsed = typeof leaf.value === "string" && /^[[{]/.test(leaf.value) ? safeParse(leaf.value) : undefined;
		if (parsed !== undefined) {
			const inner = leaves(parsed).filter((entry) => isTraceableString(entry.value) || isTraceableNumber(entry.value));
			if (inner.length && inner.every((entry) => byValue.has(JSON.stringify(entry.value)))) {
				out.push({ clientPath: leaf.path, value: leaf.value, fate: "forwarded", upstreamPaths: ["(parsed JSON)"] });
				continue;
			}
		}
		if (typeof leaf.value === "number") {
			const sameKey = upstreamLeaves.filter((candidate) => typeof candidate.value === "number" && foldKey(lastKey(candidate.path)) === foldKey(lastKey(leaf.path)));
			if (sameKey.length) {
				out.push({ clientPath: leaf.path, value: leaf.value, fate: "changed", upstreamPaths: sameKey.map((m) => `${m.path}=${m.value}`) });
				continue;
			}
		}
		out.push({ clientPath: leaf.path, value: leaf.value, fate: "dropped", upstreamPaths: [] });
	}
	return out;
}

export type BodyDiff = { added: Leaf[]; removed: Leaf[]; changed: Array<{ path: string; from: unknown; to: unknown }> };

function leafMap(body: any): Map<string, unknown> {
	return new Map(leaves(body).map((leaf) => [leaf.path, leaf.value]));
}

export function diffBodies(before: any, after: any): BodyDiff {
	const a = leafMap(before);
	const b = leafMap(after);
	const diff: BodyDiff = { added: [], removed: [], changed: [] };
	for (const [path, value] of b) {
		if (!a.has(path)) diff.added.push({ path, value });
		else if (JSON.stringify(a.get(path)) !== JSON.stringify(value)) diff.changed.push({ path, from: a.get(path), to: value });
	}
	for (const [path, value] of a) if (!b.has(path)) diff.removed.push({ path, value });
	return diff;
}

export function isEmptyDiff(diff: BodyDiff): boolean {
	return !diff.added.length && !diff.removed.length && !diff.changed.length;
}

/** Keys a provider body needs whatever the client sends; never reported as invented. */
const STRUCTURAL = new Set([
	"model", "messages", "input", "contents", "system", "systemInstruction", "system_instruction", "instructions", "stream",
	"anthropic_version", "max_tokens", "tools", "role", "content", "type", "text", "parts", "tool_choice",
]);

export type InventedField = { path: string; value: unknown };

/**
 * Upstream fields the client did not ask for: top-level keys (and their leaves) that have no
 * client counterpart. Content structure is excluded.
 */
export function inventedFields(clientBody: any, upstreamBody: any): InventedField[] {
	if (!upstreamBody || typeof upstreamBody !== "object") return [];
	const clientKeys = new Set(Object.keys(clientBody ?? {}).map(foldKey));
	const out: InventedField[] = [];
	for (const [key, value] of Object.entries(upstreamBody)) {
		if (STRUCTURAL.has(key) || clientKeys.has(foldKey(key))) continue;
		for (const leaf of leaves(value, `$.${key}`)) {
			if (isTraceableString(leaf.value) || isTraceableNumber(leaf.value)) continue;
			out.push(leaf);
		}
	}
	return out;
}

/** Leaves that differ between two runs of the same client request. */
export function nondeterministicPaths(first: any, second: any): Array<{ path: string; a: unknown; b: unknown }> {
	const diff = diffBodies(first, second);
	return [
		...diff.changed.map((entry) => ({ path: entry.path, a: entry.from, b: entry.to })),
		...diff.added.map((entry) => ({ path: entry.path, a: undefined, b: entry.value })),
		...diff.removed.map((entry) => ({ path: entry.path, a: entry.value, b: undefined })),
	];
}

const PREFIX_KEYS = {
	tools: ["tools", "toolConfig"],
	system: ["system", "instructions", "systemInstruction", "system_instruction"],
	history: ["messages", "input", "contents"],
};

function stripCacheMarkers(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stripCacheMarkers);
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value)) {
			if (key === "cache_control" || key === "prompt_cache_breakpoint") continue;
			out[key] = stripCacheMarkers(child);
		}
		return out;
	}
	return value;
}

export type PrefixCheck = {
	stable: boolean;
	divergence?: string;
	cacheMarkerMoves?: number;
};

/**
 * Compares consecutive agent steps. Step N+1 extends step N, so tools, system and every history
 * item of step N must serialise identically in step N+1 (cache markers aside, which move by design).
 */
export function comparePrefix(previous: any, next: any): PrefixCheck {
	if (!previous || !next) return { stable: false, divergence: "missing body" };
	for (const key of [...PREFIX_KEYS.tools, ...PREFIX_KEYS.system]) {
		if (!(key in previous) && !(key in next)) continue;
		if (JSON.stringify(stripCacheMarkers(previous[key])) !== JSON.stringify(stripCacheMarkers(next[key]))) {
			return { stable: false, divergence: `$.${key} differs between steps` };
		}
	}
	let markerMoves = 0;
	for (const key of PREFIX_KEYS.history) {
		const a = previous[key];
		const b = next[key];
		if (!Array.isArray(a) || !Array.isArray(b)) continue;
		// The last item of step N may legitimately differ (e.g. a breakpoint on the final user turn).
		for (let index = 0; index < a.length; index += 1) {
			const left = JSON.stringify(stripCacheMarkers(a[index]));
			const right = JSON.stringify(stripCacheMarkers(b[index]));
			if (JSON.stringify(a[index]) !== JSON.stringify(b[index])) markerMoves += 1;
			if (left !== right) {
				return { stable: false, divergence: `$.${key}[${index}] differs between steps: ${left.slice(0, 160)} vs ${right.slice(0, 160)}`, cacheMarkerMoves: markerMoves };
			}
		}
	}
	return { stable: true, cacheMarkerMoves: markerMoves };
}

export function summariseDiff(diff: BodyDiff, limit = 8): string[] {
	return [
		...diff.added.map((leaf) => `+ ${pathSignature(leaf.path)} = ${JSON.stringify(leaf.value)}`),
		...diff.changed.map((entry) => `~ ${pathSignature(entry.path)}: ${JSON.stringify(entry.from)} -> ${JSON.stringify(entry.to)}`),
		...diff.removed.map((leaf) => `- ${pathSignature(leaf.path)}`),
	].map((line) => (line.length > 200 ? `${line.slice(0, 197)}...` : line)).slice(0, limit);
}

function safeParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
