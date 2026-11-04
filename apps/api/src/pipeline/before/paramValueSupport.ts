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
	type ParameterSpec,
	type ParameterSpecs,
	type ParameterValue,
} from "@core/model-parameters";
import type { ProviderCandidate } from "./types";

export type ParameterValueIssue = {
	param: string;
	value: ParameterValue;
	reason: "not_allowed" | "below_min" | "above_max" | "off_step" | "unsupported_here";
	allowed?: ParameterValue[];
	min?: number;
	max?: number;
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

/** The request's value for a spec: under its name, a dotted path, or an alias. */
function requestedValue(body: Record<string, unknown>, name: string, spec: ParameterSpec): { field: string; value: unknown } | null {
	for (const field of [name, ...(spec.aliases ?? [])]) {
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

function checkValue(param: string, value: ParameterValue, spec: ParameterSpec): ParameterValueIssue | null {
	const numeric = isNumericSpec(spec);
	if (spec.values?.length) {
		if (spec.values.some((allowed) => sameValue(value, allowed, numeric))) return null;
		return { param, value, reason: "not_allowed", allowed: spec.values };
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
): ParameterValueIssue[] {
	if (!isRecord(rawBody)) return [];
	const specs = candidateSpecs(candidate);
	const issues: ParameterValueIssue[] = [];
	for (const [name, spec] of Object.entries(specs)) {
		const requested = requestedValue(rawBody, name, spec);
		if (!requested || !isScalar(requested.value)) continue;
		const resolved = resolveParameterSpec(spec, rawBody, specs);
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
	}
}
