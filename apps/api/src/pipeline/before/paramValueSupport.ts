// Purpose: Check requested parameter VALUES against each route's parameter specs.
// Why: Name-based support (paramCapabilities) cannot tell that a route takes `size`
//      but not 4k, or `voice` but not this voice. Routing a request to a route
//      that refuses its value wastes an attempt and returns the provider's error.
// How: For each candidate, normalise its stored params (see core/model-parameters),
//      apply `when` rules for the request, and report values outside the allowed
//      list or range. A route that stores no list or range for a parameter has
//      no opinion and never reports an issue for it.

import {
	normalizeParameterSpecs,
	resolveParameterSpec,
	withinBounds,
	type ParameterSpec,
	type ParameterSpecs,
	type ParameterValue,
} from "@core/model-parameters";
import type { Endpoint } from "@core/types";
import { textEndpointRegistryFor } from "./textParamPolicy";
import type { ProviderCandidate } from "./types";

export type ParameterValueIssue = {
	param: string;
	value: ParameterValue;
	reason: "not_allowed" | "below_min" | "above_max" | "off_step" | "unsupported_here" | "file_too_large";
	allowed?: ParameterValue[];
	min?: number;
	max?: number;
	/** For file_too_large: the route's limit in bytes. */
	max_bytes?: number;
	message?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readPath(body: Record<string, unknown>, path: string): unknown {
	let current: unknown = body;
	for (const segment of path.split(".")) {
		if (!isRecord(current)) return undefined;
		current = current[segment];
	}
	return current;
}

function isScalar(value: unknown): value is ParameterValue {
	return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

function writePath(body: Record<string, unknown>, path: string, value: unknown): void {
	const segments = path.split(".");
	let current = body;
	for (const segment of segments.slice(0, -1)) {
		// Copy each level so the caller's body is never changed.
		const next = isRecord(current[segment]) ? { ...(current[segment] as Record<string, unknown>) } : {};
		current[segment] = next;
		current = next;
	}
	current[segments[segments.length - 1]] = value;
}

/**
 * The body with each wire spelling also under its canonical name, as the
 * name check reads it: Chat Completions `reasoning_effort` and Messages
 * `output_config.effort` are both `reasoning.effort`. Fields already sent under
 * the canonical name win.
 */
function canonicalBody(endpoint: Endpoint | undefined, body: Record<string, unknown>): Record<string, unknown> {
	const registry = endpoint ? textEndpointRegistryFor(endpoint) : null;
	if (!registry) return body;
	const view: Record<string, unknown> = { ...body };
	const alias = (canonical: string, value: unknown) => {
		if (value === undefined || value === null) return;
		if (readPath(view, canonical) === undefined) writePath(view, canonical, value);
	};
	for (const [key, canonical] of Object.entries(registry.keyToCanonicalParam)) {
		if (key !== canonical && Object.prototype.hasOwnProperty.call(body, key)) alias(canonical, body[key]);
	}
	if (endpoint === "messages" && isRecord(body.output_config)) alias("reasoning.effort", body.output_config.effort);
	return view;
}

/** Wire spellings of a canonical name, so a spec stored as `reasoning_effort` matches `reasoning.effort`. */
function canonicalName(endpoint: Endpoint | undefined, name: string): string | null {
	const registry = endpoint ? textEndpointRegistryFor(endpoint) : null;
	const canonical = registry?.keyToCanonicalParam[name];
	return canonical && canonical !== name ? canonical : null;
}

/** The request's value for a spec: under its name, a dotted path, its canonical name, or an alias. */
function requestedValue(
	body: Record<string, unknown>,
	name: string,
	spec: ParameterSpec,
	endpoint?: Endpoint,
): { field: string; value: unknown } | null {
	const canonical = canonicalName(endpoint, name);
	for (const field of [name, ...(canonical ? [canonical] : []), ...(spec.aliases ?? [])]) {
		const value = readPath(body, field);
		if (value !== undefined && value !== null) return { field, value };
	}
	return null;
}

function isNumericSpec(spec: ParameterSpec): boolean {
	const types = Array.isArray(spec.type) ? spec.type : spec.type ? [spec.type] : [];
	if (types.some((type) => type === "integer" || type === "number")) return true;
	return Boolean(spec.values?.length && spec.values.every((value) => typeof value === "number"));
}

function sameValue(requested: ParameterValue, allowed: ParameterValue, numeric: boolean): boolean {
	if (numeric) return Number(requested) === Number(allowed);
	if (typeof allowed === "boolean" || typeof requested === "boolean") return String(requested) === String(allowed);
	return String(requested).trim().toLowerCase() === String(allowed).trim().toLowerCase();
}

/** A file the request carries (multipart File/Blob), as its size in bytes. */
function fileSize(value: unknown): number | null {
	if (!value || typeof value !== "object") return null;
	const size = (value as { size?: unknown }).size;
	const isBlobLike = typeof (value as { arrayBuffer?: unknown }).arrayBuffer === "function";
	return isBlobLike && typeof size === "number" && Number.isFinite(size) ? size : null;
}

function checkValue(param: string, value: ParameterValue, spec: ParameterSpec): ParameterValueIssue | null {
	const numeric = isNumericSpec(spec);
	// An open list names common values; any other value is accepted too.
	if (spec.values?.length && spec.open) return null;
	if (spec.values?.length) {
		// A rule can narrow a listed parameter's range, so the list is cut to it.
		const allowed = spec.values.filter((entry) => withinBounds(spec, entry));
		if (allowed.some((entry) => sameValue(value, entry, numeric))) return null;
		return { param, value, reason: "not_allowed", allowed };
	}
	if (!numeric) return null;
	const number = Number(value);
	if (!Number.isFinite(number)) return null;
	if (spec.min !== undefined && number < spec.min) return { param, value, reason: "below_min", min: spec.min, max: spec.max };
	if (spec.max !== undefined && number > spec.max) return { param, value, reason: "above_max", min: spec.min, max: spec.max };
	if (spec.step !== undefined && spec.min !== undefined) {
		const steps = (number - spec.min) / spec.step;
		if (Math.abs(steps - Math.round(steps)) > 1e-9) return { param, value, reason: "off_step", min: spec.min, max: spec.max };
	}
	return null;
}

/** Specs for a candidate's capability params, cached per params object. */
const specsCache = new WeakMap<object, ParameterSpecs>();
function candidateSpecs(candidate: Pick<ProviderCandidate, "capabilityParams">): ParameterSpecs {
	const params = candidate.capabilityParams;
	if (!params || typeof params !== "object") return {};
	const cached = specsCache.get(params);
	if (cached) return cached;
	const specs = normalizeParameterSpecs(params);
	specsCache.set(params, specs);
	return specs;
}

/** Requested values this candidate's stored specs say it does not accept. */
export function parameterValueIssues(
	candidate: Pick<ProviderCandidate, "capabilityParams">,
	rawBody: unknown,
	endpoint?: Endpoint,
): ParameterValueIssue[] {
	if (!isRecord(rawBody)) return [];
	const specs = candidateSpecs(candidate);
	if (!Object.keys(specs).length) return [];
	const body = canonicalBody(endpoint, rawBody);
	const issues: ParameterValueIssue[] = [];
	for (const [name, spec] of Object.entries(specs)) {
		const requested = requestedValue(body, name, spec, endpoint);
		if (!requested) continue;
		const bytes = fileSize(requested.value);
		if (bytes !== null) {
			if (spec.max_file_size_bytes !== undefined && bytes > spec.max_file_size_bytes) {
				issues.push({ param: requested.field, value: bytes, reason: "file_too_large", max_bytes: spec.max_file_size_bytes });
			}
			continue;
		}
		if (!isScalar(requested.value)) continue;
		const resolved = resolveParameterSpec(spec, body, specs);
		if (!resolved.supported) {
			// An explicitly unsupported parameter is the name check's job; only a
			// rule that turns it off for this request is reported here.
			if (spec.supported) {
				const rule = spec.when?.find((entry) => entry.supported === false);
				issues.push({ param: requested.field, value: requested.value, reason: "unsupported_here", ...(rule?.message ? { message: rule.message } : {}) });
			}
			continue;
		}
		const issue = checkValue(requested.field, requested.value, resolved);
		if (issue) issues.push(issue);
	}
	return issues;
}

/** A short, client-facing description of one issue. */
export function describeParameterValueIssue(issue: ParameterValueIssue): string {
	const value = JSON.stringify(issue.value);
	switch (issue.reason) {
		case "not_allowed":
			return `${issue.param}=${value} is not accepted; allowed: ${(issue.allowed ?? []).map((entry) => JSON.stringify(entry)).join(", ")}.`;
		case "below_min":
		case "above_max":
			return `${issue.param}=${value} is outside ${issue.min ?? "-∞"} to ${issue.max ?? "∞"}.`;
		case "off_step":
			return `${issue.param}=${value} is not one of the allowed steps between ${issue.min} and ${issue.max}.`;
		case "unsupported_here":
			return issue.message ?? `${issue.param} cannot be sent with the other values in this request.`;
		case "file_too_large":
			return `${issue.param} is ${Math.ceil(Number(issue.value) / 1048576)} MB; this provider takes at most ${Math.floor((issue.max_bytes ?? 0) / 1048576)} MB.`;
	}
}
