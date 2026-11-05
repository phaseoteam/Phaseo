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

export function isParamEnabled(params: StoredCapabilityParams, name: string): boolean {
	return normalizeParameterSpecs(params)[name]?.supported === true;
}

/** Adds or removes one parameter, keeping its stored spec when it has one. */
export function setParamEnabled(params: StoredCapabilityParams, name: string, enabled: boolean): StoredCapabilityParams {
	if (Array.isArray(params)) {
		const present = params.some((entry) => entryName(entry) === name);
		if (enabled) return present ? params : [...params, name];
		return params.filter((entry) => entryName(entry) !== name);
	}
	const current = isRecord(params) ? params : {};
	if (enabled) {
		const existing = current[name];
		if (existing !== undefined && existing !== false) return current;
		return { ...current, [name]: true };
	}
	const next = { ...current };
	delete next[name];
	for (const [key, value] of Object.entries(next)) {
		if (isRecord(value) && value.param_id === name) delete next[key];
	}
	return next;
}

/** One line per parameter that has allowed values, for a preview. */
export function describeStoredParams(params: StoredCapabilityParams, maxValues = 12): string[] {
	const lines: string[] = [];
	for (const [name, spec] of Object.entries(normalizeParameterSpecs(params))) {
		if (!spec.supported) {
			lines.push(`${name}: not supported`);
			continue;
		}
		const options = parameterOptions(spec).map((option) => String(option.value));
		const range = spec.min !== undefined || spec.max !== undefined ? `${spec.min ?? "…"}–${spec.max ?? "…"}${spec.step ? ` step ${spec.step}` : ""}` : null;
		const parts = [
			options.length ? options.slice(0, maxValues).join(", ") + (options.length > maxValues ? ` (+${options.length - maxValues})` : "") : range,
			spec.default !== undefined ? `default ${String(spec.default)}` : null,
			spec.when?.length ? `${spec.when.length} rule${spec.when.length === 1 ? "" : "s"}` : null,
		].filter(Boolean);
		if (parts.length) lines.push(`${name}: ${parts.join(" · ")}`);
	}
	return lines;
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
