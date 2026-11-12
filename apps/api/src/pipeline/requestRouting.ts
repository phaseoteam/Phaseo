// Purpose: Normalize request-level routing controls across legacy and first-class shapes.
// Why: Keeps `provider` compatibility while letting `routing` become the canonical interface.
// How: Merges provider/routing hints, resolves aliases, and surfaces explicit routing flags.

import { normalizeProviderId, normalizeProviderList } from "@/lib/config/providerAliases";
import type { ProviderCandidate } from "./before/types";
import { isFreePriceCard } from "./pricing/free";

type PlainObject = Record<string, any>;

export type RoutingModePreference =
	| "balanced"
	| "price"
	| "latency"
	| "throughput";

function asPlainObject(value: unknown): PlainObject | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as PlainObject)
		: null;
}

function clonePlainObject(value: PlainObject | null): PlainObject {
	return value ? { ...value } : {};
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
	for (const value of values) {
		if (value !== undefined && value !== null) return value;
	}
	return undefined;
}

function readSortMode(value: unknown): string | null {
	if (typeof value === "string") return value;
	if (value && typeof value === "object") {
		const sort = value as PlainObject;
		if (typeof sort.mode === "string") return sort.mode;
		if (typeof sort.metric === "string") return sort.metric;
		if (typeof sort.by === "string") return sort.by;
	}
	return null;
}

function normalizeBoolean(value: unknown): boolean | null {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();
		if (normalized === "true") return true;
		if (normalized === "false") return false;
	}
	return null;
}

function normalizeStringArray(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const items = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : [];
}

function normalizeNullableObject(value: unknown): PlainObject | null {
	const objectValue = asPlainObject(value);
	return objectValue ? { ...objectValue } : null;
}

export type ProviderQualifiedModelSelection = {
	providerId: string;
	model: string;
};

export type ProviderQualifiedModelConstraintResult =
	| { ok: true; body: any }
	| {
		ok: false;
		providerId: string;
		model: string;
		field: "provider.only" | "provider.ignore" | "routing.only" | "routing.ignore";
		values: string[];
	};

export type ProviderQualifiedModelCandidateResult =
	| { ok: true; providers: ProviderCandidate[] }
	| {
		ok: false;
		reason:
			| "qualified_provider_unavailable"
			| "qualified_free_provider_unavailable";
		providerId: string;
		model: string;
	};

export type QuantizationCandidateResult =
	| {
		ok: true;
		providers: ProviderCandidate[];
		diagnostics: QuantizationRoutingDiagnostics | null;
	}
	| {
		ok: false;
		reason: "quantization_not_available";
		requested: string[];
		diagnostics: QuantizationRoutingDiagnostics;
	};

export type QuantizationRoutingDiagnostics = {
	requested: string[];
	normalizedRequested: string[];
	available: string[];
	providerCountBefore: number;
	providerCountAfter: number;
	droppedProviders: Array<{
		providerId: string;
		providerModelSlug: string | null;
		quantization: string | null;
		reason: "quantization_mismatch" | "quantization_metadata_missing";
	}>;
};

const QUANTIZATION_ALIASES: Record<string, string> = {
	bfloat16: "bf16",
	float16: "fp16",
	float32: "fp32",
	float4: "fp4",
	float6: "fp6",
	float8: "fp8",
};

/** Normalize only unambiguous spelling variants; do not equate e.g. `4-bit` with FP4 or INT4. */
export function normalizeQuantization(value: string): string {
	const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
	return QUANTIZATION_ALIASES[normalized] ?? normalized;
}

export function filterQuantizationCandidates(
	providers: ProviderCandidate[],
	requestedQuantizations: string[] | null,
): QuantizationCandidateResult {
	if (requestedQuantizations === null) {
		return { ok: true, providers, diagnostics: null };
	}

	const normalizedRequested = Array.from(new Set(
		requestedQuantizations.map(normalizeQuantization).filter(Boolean),
	));
	const requestedSet = new Set(normalizedRequested);
	const available = Array.from(new Set(
		providers
			.map((provider) => provider.quantizationScheme)
			.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
			.map(normalizeQuantization),
	)).sort();
	const droppedProviders: QuantizationRoutingDiagnostics["droppedProviders"] = [];
	const filtered = providers.filter((provider) => {
		const raw = provider.quantizationScheme;
		if (typeof raw !== "string" || !raw.trim()) {
			droppedProviders.push({
				providerId: provider.providerId,
				providerModelSlug: provider.providerModelSlug,
				quantization: null,
				reason: "quantization_metadata_missing",
			});
			return false;
		}
		if (requestedSet.has(normalizeQuantization(raw))) return true;
		droppedProviders.push({
			providerId: provider.providerId,
			providerModelSlug: provider.providerModelSlug,
			quantization: raw,
			reason: "quantization_mismatch",
		});
		return false;
	});
	const diagnostics: QuantizationRoutingDiagnostics = {
		requested: requestedQuantizations,
		normalizedRequested,
		available,
		providerCountBefore: providers.length,
		providerCountAfter: filtered.length,
		droppedProviders,
	};
	if (filtered.length === 0) {
		return {
			ok: false,
			reason: "quantization_not_available",
			requested: requestedQuantizations,
			diagnostics,
		};
	}
	return { ok: true, providers: filtered, diagnostics };
}

const PROVIDER_QUALIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

export type ProviderQualifiedModelSyntaxError = {
	reason: "invalid_provider_slug" | "invalid_provider_qualified_model";
	input: string;
	providerSlug: string;
	message: string;
};

export type ProviderQualifiedModelProviderValidationResult =
	| { ok: true }
	| {
		ok: false;
		reason: "unknown_provider_slug";
		providerId: string;
		model: string;
		message: string;
	};

export function validateProviderQualifiedModelSyntax(
	value: unknown,
): ProviderQualifiedModelSyntaxError | null {
	if (typeof value !== "string") return null;
	const input = value.trim();
	const qualifierSeparator = input.indexOf(":");
	const modelNamespaceSeparator = input.indexOf("/");

	// A colon after the namespace slash is a canonical model suffix such as
	// ":free", not a provider qualifier.
	if (
		qualifierSeparator < 0 ||
		modelNamespaceSeparator < 0 ||
		qualifierSeparator > modelNamespaceSeparator
	) {
		return null;
	}

	const providerSlug = input.slice(0, qualifierSeparator).trim();
	if (!PROVIDER_QUALIFIER_PATTERN.test(providerSlug)) {
		return {
			reason: "invalid_provider_slug",
			input,
			providerSlug,
			message:
				`Invalid provider slug "${providerSlug}" in model identifier "${input}". Provider slugs must start with a letter or number and contain only letters, numbers, ".", "_" or "-".`,
		};
	}

	const model = input.slice(qualifierSeparator + 1).trim();
	if (
		modelNamespaceSeparator <= qualifierSeparator + 1 ||
		model.startsWith(":") ||
		model.startsWith("/") ||
		model.endsWith("/")
	) {
		return {
			reason: "invalid_provider_qualified_model",
			input,
			providerSlug,
			message:
				`Invalid provider-qualified model identifier "${input}". Expected "<provider>:<publisher>/<model>".`,
		};
	}

	return null;
}

export function parseProviderQualifiedModel(
	value: unknown,
): ProviderQualifiedModelSelection | null {
	if (typeof value !== "string") return null;
	if (validateProviderQualifiedModelSyntax(value)) return null;
	const input = value.trim();
	const qualifierSeparator = input.indexOf(":");
	const modelNamespaceSeparator = input.indexOf("/");
	if (
		qualifierSeparator <= 0 ||
		modelNamespaceSeparator <= qualifierSeparator + 1
	) {
		return null;
	}

	const providerId = input.slice(0, qualifierSeparator).trim();
	const model = input.slice(qualifierSeparator + 1).trim();
	if (!PROVIDER_QUALIFIER_PATTERN.test(providerId) || !model.includes("/")) {
		return null;
	}

	return {
		providerId: normalizeProviderId(providerId),
		model,
	};
}

export function canonicalizeProviderQualifiedModelRequest(body: any): {
	body: any;
	selection: ProviderQualifiedModelSelection | null;
	syntaxError: ProviderQualifiedModelSyntaxError | null;
} {
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return { body, selection: null, syntaxError: null };
	}
	const syntaxError = validateProviderQualifiedModelSyntax(body.model);
	if (syntaxError) return { body, selection: null, syntaxError };
	const selection = parseProviderQualifiedModel(body.model);
	if (!selection) return { body, selection: null, syntaxError: null };
	return {
		body: {
			...body,
			model: selection.model,
		},
		selection,
		syntaxError: null,
	};
}

export function validateProviderQualifiedModelProvider(
	selection: ProviderQualifiedModelSelection | null,
	knownProviderIds: string[],
): ProviderQualifiedModelProviderValidationResult {
	if (!selection) return { ok: true };
	const knownProviders = new Set(normalizeProviderList(knownProviderIds));
	if (knownProviders.has(selection.providerId)) return { ok: true };
	const qualifiedModel = `${selection.providerId}:${selection.model}`;
	return {
		ok: false,
		reason: "unknown_provider_slug",
		providerId: selection.providerId,
		model: selection.model,
		message:
			`Unknown provider slug "${selection.providerId}" in provider-qualified model "${qualifiedModel}". Use a provider slug returned by Phaseo's provider catalogue.`,
	};
}

function normalizedProviderConstraintValues(value: unknown): string[] {
	return normalizeProviderList(normalizeStringArray(value) ?? []);
}

export function applyProviderQualifiedModelConstraint(
	body: any,
	selection: ProviderQualifiedModelSelection | null,
): ProviderQualifiedModelConstraintResult {
	if (!selection || !body || typeof body !== "object" || Array.isArray(body)) {
		return { ok: true, body };
	}

	const sources: Array<{
		name: "provider" | "routing";
		value: PlainObject | null;
	}> = [
		{ name: "provider", value: asPlainObject(body.provider) },
		{ name: "routing", value: asPlainObject(body.routing) },
	];

	for (const source of sources) {
		if (!source.value) continue;
		const only = normalizedProviderConstraintValues(source.value.only);
		if (only.length > 0 && !only.includes(selection.providerId)) {
			return {
				ok: false,
				providerId: selection.providerId,
				model: selection.model,
				field: `${source.name}.only`,
				values: only,
			};
		}
		const ignore = normalizedProviderConstraintValues(source.value.ignore);
		if (ignore.includes(selection.providerId)) {
			return {
				ok: false,
				providerId: selection.providerId,
				model: selection.model,
				field: `${source.name}.ignore`,
				values: ignore,
			};
		}
	}

	const provider = {
		...clonePlainObject(asPlainObject(body.provider)),
		only: [selection.providerId],
	};
	const routing = asPlainObject(body.routing);
	return {
		ok: true,
		body: {
			...body,
			provider,
			...(routing
				? {
					routing: {
						...routing,
						only: [selection.providerId],
					},
				}
				: {}),
		},
	};
}

export function filterProviderQualifiedModelCandidates(
	providers: ProviderCandidate[],
	selection: ProviderQualifiedModelSelection | null,
): ProviderQualifiedModelCandidateResult {
	if (!selection) {
		return { ok: true, providers };
	}

	const matchingProviders = providers.filter(
		(provider) =>
			normalizeProviderId(provider.providerId) === selection.providerId,
	);
	if (matchingProviders.length === 0) {
		return {
			ok: false,
			reason: "qualified_provider_unavailable",
			providerId: selection.providerId,
			model: selection.model,
		};
	}

	if (!selection.model.toLowerCase().endsWith(":free")) {
		return { ok: true, providers: matchingProviders };
	}

	const freeProviders = matchingProviders.filter((provider) =>
		isFreePriceCard(provider.pricingCard),
	);
	if (freeProviders.length === 0) {
		return {
			ok: false,
			reason: "qualified_free_provider_unavailable",
			providerId: selection.providerId,
			model: selection.model,
		};
	}

	return { ok: true, providers: freeProviders };
}

export type EffectiveRoutingHints = {
	provider: PlainObject;
	routing: PlainObject;
	merged: PlainObject;
	requestedMode: string | null;
	allowFallbacks: boolean;
	requireParameters: boolean;
	returnDiagnostics: boolean;
	requiredExecutionRegion: string | null;
	requiredDataRegion: string | null;
	requireZeroDataRetention: boolean | null;
	dataCollection: "allow" | "deny" | null;
	zdr: boolean | null;
	enforceDistillableText: boolean | null;
	quantizations: string[] | null;
	maxPrice: PlainObject | null;
	preferredMinThroughput: number | PlainObject | null;
	preferredMaxLatency: number | PlainObject | null;
};

export function getEffectiveRoutingHints(body: any): EffectiveRoutingHints {
	const provider = clonePlainObject(asPlainObject(body?.provider));
	const routing = clonePlainObject(asPlainObject(body?.routing));
	const merged: PlainObject = { ...provider, ...routing };
	const diagnosticsFlag = firstDefined(
		routing.diagnostics,
		routing.return_diagnostics,
		routing.returnDiagnostics,
		provider.diagnostics,
		provider.return_diagnostics,
		provider.returnDiagnostics,
	);
	const requestedMode = firstDefined(
		typeof routing.mode === "string" ? routing.mode : undefined,
		readSortMode(routing.sort),
		readSortMode(provider.sort),
	) ?? null;
	const requireZeroDataRetention = (() => {
		const direct = normalizeBoolean(
			firstDefined(
				routing.require_zero_data_retention,
				routing.requireZeroDataRetention,
				provider.require_zero_data_retention,
				provider.requireZeroDataRetention,
			),
		);
		if (direct !== null) return direct;
		const zdr = normalizeBoolean(firstDefined(routing.zdr, provider.zdr));
		return zdr;
	})();

	return {
		provider,
		routing,
		merged,
		requestedMode,
		allowFallbacks:
			normalizeBoolean(
				firstDefined(
					routing.allow_fallbacks,
					routing.allowFallbacks,
					provider.allow_fallbacks,
					provider.allowFallbacks,
				),
			) ?? true,
		requireParameters:
			normalizeBoolean(
				firstDefined(
					routing.require_parameters,
					routing.requireParameters,
					provider.require_parameters,
					provider.requireParameters,
				),
			) ?? false,
		returnDiagnostics: normalizeBoolean(diagnosticsFlag) ?? false,
		requiredExecutionRegion:
			firstDefined(
				routing.required_execution_region,
				routing.requiredExecutionRegion,
				provider.required_execution_region,
				provider.requiredExecutionRegion,
			) ?? null,
		requiredDataRegion:
			firstDefined(
				routing.required_data_region,
				routing.requiredDataRegion,
				provider.required_data_region,
				provider.requiredDataRegion,
			) ?? null,
		requireZeroDataRetention,
		dataCollection:
			firstDefined(
				routing.data_collection,
				routing.dataCollection,
				provider.data_collection,
				provider.dataCollection,
			) ?? null,
		zdr: normalizeBoolean(firstDefined(routing.zdr, provider.zdr)),
		enforceDistillableText: normalizeBoolean(
			firstDefined(
				routing.enforce_distillable_text,
				routing.enforceDistillableText,
				provider.enforce_distillable_text,
				provider.enforceDistillableText,
			),
		),
		quantizations:
			normalizeStringArray(firstDefined(routing.quantizations, provider.quantizations)) ??
			null,
		maxPrice:
			normalizeNullableObject(
				firstDefined(
					routing.max_price,
					routing.maxPrice,
					provider.max_price,
					provider.maxPrice,
				),
			) ?? null,
		preferredMinThroughput:
			firstDefined(
				routing.preferred_min_throughput,
				routing.preferredMinThroughput,
				provider.preferred_min_throughput,
				provider.preferredMinThroughput,
			) ?? null,
		preferredMaxLatency:
			firstDefined(
				routing.preferred_max_latency,
				routing.preferredMaxLatency,
				provider.preferred_max_latency,
				provider.preferredMaxLatency,
			) ?? null,
	};
}

/**
 * A request's limits on where its content may go, as `provider` fields for
 * another gateway request that sends the same content (the auto-router's
 * classifier, request classifiers): zero data retention, required regions, and
 * the providers it allows or excludes. Null when it sets none.
 */
export function requestDataLimits(body: any): PlainObject | null {
	const hints = getEffectiveRoutingHints(body);
	const providerList = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : null;
	const only = providerList(hints.merged.only);
	const ignore = providerList(hints.merged.ignore);
	const limits: PlainObject = {
		...(hints.requireZeroDataRetention === true ? { require_zero_data_retention: true } : {}),
		...(hints.requiredExecutionRegion ? { required_execution_region: hints.requiredExecutionRegion } : {}),
		...(hints.requiredDataRegion ? { required_data_region: hints.requiredDataRegion } : {}),
		...(only ? { only } : {}),
		...(ignore?.length ? { ignore } : {}),
	};
	return Object.keys(limits).length ? limits : null;
}

/** `body` with `limits` added to its `provider` fields; the limits win over the body's own. */
export function withRequestDataLimits<T extends Record<string, unknown>>(body: T, limits: PlainObject | null): T {
	if (!limits) return body;
	const provider = body.provider && typeof body.provider === "object" && !Array.isArray(body.provider) ? body.provider as PlainObject : {};
	return { ...body, provider: { ...provider, ...limits } };
}

export function normalizeRequestRoutingBody(body: any): any {
	if (!body || typeof body !== "object" || Array.isArray(body)) return body;
	const routingHints = getEffectiveRoutingHints(body);
	if (!Object.keys(routingHints.routing).length) {
		return body;
	}
	return {
		...body,
		provider: {
			...routingHints.provider,
			...routingHints.merged,
		},
	};
}

export function extractRoutingPreferenceScalar(
	value: unknown,
	preferredKeys: string[] = ["p50", "p75", "p90", "p95", "p99"],
): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const objectValue = asPlainObject(value);
	if (!objectValue) return null;
	for (const key of preferredKeys) {
		const next = objectValue[key];
		if (typeof next === "number" && Number.isFinite(next)) {
			return next;
		}
	}
	for (const next of Object.values(objectValue)) {
		if (typeof next === "number" && Number.isFinite(next)) {
			return next;
		}
	}
	return null;
}

export function collectUnsupportedRoutingFields(body: any): Array<{
	field: string;
	path: string[];
	message: string;
}> {
	const out: Array<{ field: string; path: string[]; message: string }> = [];
	const sources: Array<["provider" | "routing", PlainObject]> = [];
	const provider = asPlainObject(body?.provider);
	const routing = asPlainObject(body?.routing);
	if (provider) sources.push(["provider", provider]);
	if (routing) sources.push(["routing", routing]);

	// The documented default of each field (`noOpValue`) asks for no filtering,
	// so it is accepted; only the restrictive value needs metadata the gateway lacks.
	const mappings: Array<{
		field: string;
		aliases: string[];
		noOpValue: unknown;
		message: string;
	}> = [
		{
			field: "data_collection",
			aliases: ["data_collection", "dataCollection"],
			noOpValue: "allow",
			message:
				"Routing by provider data-collection policy is not yet backed by provider metadata in Phaseo Gateway.",
		},
		{
			field: "enforce_distillable_text",
			aliases: ["enforce_distillable_text", "enforceDistillableText"],
			noOpValue: false,
			message:
				"Routing by distillable-text policy is not yet backed by provider metadata in Phaseo Gateway.",
		},
	];

	for (const [sourceName, source] of sources) {
		for (const mapping of mappings) {
			for (const alias of mapping.aliases) {
				if (!(alias in source)) continue;
				const value = source[alias];
				if (value === undefined || value === null) continue;
				if (value === mapping.noOpValue) break;
				out.push({
					field: mapping.field,
					path: [sourceName, alias],
					message: mapping.message,
				});
				break;
			}
		}
	}

	return out;
}
