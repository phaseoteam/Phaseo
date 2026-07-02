// Purpose: Normalize request-level routing controls across legacy and first-class shapes.
// Why: Keeps `provider` compatibility while letting `routing` become the canonical interface.
// How: Merges provider/routing hints, resolves aliases, and surfaces explicit routing flags.

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

	const mappings: Array<{
		field: string;
		aliases: string[];
		message: string;
	}> = [
		{
			field: "data_collection",
			aliases: ["data_collection", "dataCollection"],
			message:
				"Routing by provider data-collection policy is not yet backed by provider metadata in AI Stats Gateway.",
		},
		{
			field: "enforce_distillable_text",
			aliases: ["enforce_distillable_text", "enforceDistillableText"],
			message:
				"Routing by distillable-text policy is not yet backed by provider metadata in AI Stats Gateway.",
		},
		{
			field: "quantizations",
			aliases: ["quantizations"],
			message:
				"Routing by quantization is not yet backed by provider metadata in AI Stats Gateway.",
		},
	];

	for (const [sourceName, source] of sources) {
		for (const mapping of mappings) {
			for (const alias of mapping.aliases) {
				if (!(alias in source)) continue;
				const value = source[alias];
				if (value === undefined || value === null) continue;
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
