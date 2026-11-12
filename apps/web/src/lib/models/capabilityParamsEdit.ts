// Purpose: Edit a route's stored capability params without losing what is stored.
// Why: The admin editor used to load params as name → boolean, so saving a route
//      replaced every detailed spec (sizes, durations, voices, rules) with `true`
//      and turned a stored list into {"0": true, "1": true, …}.
// How: Keep the stored value as it is; toggles add or remove one parameter in the
//      container form already stored; full specs are edited as JSON.

import { normalizeParameterSpecs, parameterOptions } from "@/lib/models/modelParameters";

export type StoredCapabilityParams = unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function entryName(entry: unknown): string | null {
	if (typeof entry === "string") return entry;
	if (isRecord(entry)) {
		const name = entry.param_id ?? entry.name ?? entry.id;
		return typeof name === "string" ? name : null;
	}
	return null;
}

/** The spec with its details kept and its "unsupported" markers removed. */
function withoutUnsupportedMarker(spec: Record<string, unknown>): Record<string, unknown> {
	const next: Record<string, unknown> = { ...spec, supported: true };
	if (next.support_level === "unsupported") delete next.support_level;
	return next;
}

export function isParamEnabled(params: StoredCapabilityParams, name: string): boolean {
	return normalizeParameterSpecs(params)[name]?.supported === true;
}

/** Adds or removes one parameter, keeping its stored spec when it has one. */
export function setParamEnabled(params: StoredCapabilityParams, name: string, enabled: boolean): StoredCapabilityParams {
	if (Array.isArray(params)) {
		const present = params.some((entry) => entryName(entry) === name);
		if (enabled && !present) return [...params, name];
		if (enabled) {
			if (isParamEnabled(params, name)) return params;
			return params.map((entry) => (entryName(entry) === name && isRecord(entry) ? withoutUnsupportedMarker(entry) : entry));
		}
		return params.filter((entry) => entryName(entry) !== name);
	}
	const current = isRecord(params) ? params : {};
	if (enabled) {
		const existing = current[name];
		if (existing === undefined || existing === false) return { ...current, [name]: true };
		// A detailed spec marked unsupported keeps its details and loses the marker.
		if (isRecord(existing) && (existing.supported === false || existing.support_level === "unsupported")) {
			return { ...current, [name]: withoutUnsupportedMarker(existing) };
		}
		return current;
	}
	const next = { ...current };
	delete next[name];
	for (const [key, value] of Object.entries(next)) {
		if (isRecord(value) && value.param_id === name) delete next[key];
	}
	return next;
}

/**
 * What the preview shows for one parameter. The component words it through the
 * message catalogues, so only values and numbers are here.
 */
export type StoredParamPreview =
	| { name: string; supported: false }
	| {
			name: string;
			supported: true;
			/** The first allowed values, as text. */
			values?: string[];
			/** How many more allowed values there are. */
			more?: number;
			range?: { min?: number; max?: number; step?: number };
			default?: string;
			rules?: number;
	  };

/** One entry per parameter that is unsupported or has values, a range, a default or rules. */
export function describeStoredParams(params: StoredCapabilityParams, maxValues = 12): StoredParamPreview[] {
	const entries: StoredParamPreview[] = [];
	for (const [name, spec] of Object.entries(normalizeParameterSpecs(params))) {
		if (!spec.supported) {
			entries.push({ name, supported: false });
			continue;
		}
		const options = parameterOptions(spec).map((option) => String(option.value));
		const entry: StoredParamPreview = { name, supported: true };
		if (options.length) {
			entry.values = options.slice(0, maxValues);
			if (options.length > maxValues) entry.more = options.length - maxValues;
		} else if (spec.min !== undefined || spec.max !== undefined) {
			entry.range = { min: spec.min, max: spec.max, ...(spec.step ? { step: spec.step } : {}) };
		}
		if (spec.default !== undefined) entry.default = String(spec.default);
		if (spec.when?.length) entry.rules = spec.when.length;
		if (entry.values || entry.range || entry.default !== undefined || entry.rules) entries.push(entry);
	}
	return entries;
}

/** Parses the JSON editor's text; empty text is no params. */
export function parseStoredParams(text: string): { ok: true; params: StoredCapabilityParams } | { ok: false; error: string } {
	const trimmed = text.trim();
	if (!trimmed) return { ok: true, params: {} };
	try {
		const parsed = JSON.parse(trimmed) as unknown;
		if (!isRecord(parsed) && !Array.isArray(parsed)) return { ok: false, error: "Params must be a JSON object or list." };
		return { ok: true, params: parsed };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
