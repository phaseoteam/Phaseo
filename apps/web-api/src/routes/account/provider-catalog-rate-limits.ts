import { z } from "zod";
import type { ProviderCatalogIssue, ProviderCatalogModelPreview } from "./provider-catalog";

// Providers declare the limits they impose on Phaseo's account. They only rank the provider
// lower in routing once reached (never block), so declarations apply without review.
export const RATE_LIMIT_FIELDS = ["requests_per_minute", "requests_per_day", "tokens_per_minute", "tokens_per_day"] as const;
export const ALL_PROVIDER_MODELS = "*";
const MAX_RATE_LIMITS = 1_000;
const MAX_MODEL_SLUG_LENGTH = 2_000;

export type ProviderCatalogRateLimit = {
	/** Upstream provider model slug, or null for a provider-wide limit. */
	model: string | null;
} & Record<typeof RATE_LIMIT_FIELDS[number], number | null>;

const limitValue = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional();

export const rateLimitEntrySchema = z.object({
	model: z.string().trim().min(1).max(MAX_MODEL_SLUG_LENGTH).nullable().optional(),
	requests_per_minute: limitValue,
	requests_per_day: limitValue,
	tokens_per_minute: limitValue,
	tokens_per_day: limitValue,
}).strict();

export const rateLimitJsonSchema = {
	type: "object",
	additionalProperties: false,
	// At least one limit must be a number, matching the import's runtime check.
	anyOf: RATE_LIMIT_FIELDS.map((field) => ({ required: [field], properties: { [field]: { type: "integer" } } })),
	description: "A limit your platform imposes on Phaseo's account. Omit model for a provider-wide limit. Reaching a limit ranks your offers lower in routing; it never blocks requests.",
	properties: {
		model: { type: ["string", "null"], minLength: 1, maxLength: MAX_MODEL_SLUG_LENGTH, description: "Upstream provider_model_slug from this catalog. Omit, or use null, for a provider-wide limit." },
		...Object.fromEntries(RATE_LIMIT_FIELDS.map((field) => [field, { type: ["integer", "null"], minimum: 1, maximum: Number.MAX_SAFE_INTEGER }])),
	},
} as const;

export const rateLimitsJsonSchema = {
	type: "array",
	maxItems: MAX_RATE_LIMITS,
	description: "Optional. Request and token limits per minute or day, provider-wide or per upstream model. Each scope may appear once, and every model must be an upstream provider_model_slug in this catalog. When present, the list replaces your declared limits on import; an empty list removes them.",
	items: { $ref: "#/$defs/rateLimit" },
} as const;

/** Upstream model slugs a catalog can declare limits for, across every service tier. */
export function upstreamModelSlugs(models: ProviderCatalogModelPreview[]): Set<string> {
	return new Set(models.flatMap((model) => [model.providerModelSlug, ...(model.serviceTiers ?? []).map((tier) => tier.providerModelSlug)]));
}

/**
 * Validates a `rate_limits` declaration. `knownModels` lists the upstream model slugs limits may
 * name; a limit for any other model is rejected rather than silently dropped.
 */
export function normalizeProviderRateLimits(value: unknown, knownModels: Set<string>, path = "rate_limits"): { limits: ProviderCatalogRateLimit[]; issues: ProviderCatalogIssue[] } {
	const issues: ProviderCatalogIssue[] = [];
	if (!Array.isArray(value) || value.length > MAX_RATE_LIMITS) {
		return { limits: [], issues: [{ path, message: `Expected an array of up to ${MAX_RATE_LIMITS} rate limits.` }] };
	}
	const limits: ProviderCatalogRateLimit[] = [];
	const scopes = new Set<string>();
	for (const [index, raw] of value.entries()) {
		const entryPath = `${path}[${index}]`;
		const parsed = rateLimitEntrySchema.safeParse(raw);
		if (!parsed.success) {
			const issue = parsed.error.issues[0];
			const field = issue?.path.length ? `.${issue.path.join(".")}` : "";
			issues.push({ path: `${entryPath}${field}`, message: issue?.code === "unrecognized_keys" ? "Unknown rate limit field." : field && field !== ".model" ? "Expected a positive integer or null." : "Expected a rate limit object with an optional model." });
			continue;
		}
		const model = parsed.data.model && parsed.data.model !== ALL_PROVIDER_MODELS ? parsed.data.model : null;
		const limit = { model, ...Object.fromEntries(RATE_LIMIT_FIELDS.map((field) => [field, parsed.data[field] ?? null])) } as ProviderCatalogRateLimit;
		if (RATE_LIMIT_FIELDS.every((field) => limit[field] === null)) {
			issues.push({ path: entryPath, message: "Declare at least one limit." });
			continue;
		}
		const scope = model ?? ALL_PROVIDER_MODELS;
		if (scopes.has(scope)) {
			issues.push({ path: entryPath, message: model ? `Duplicate rate limit for model: ${model}.` : "Duplicate provider-wide rate limit." });
			continue;
		}
		scopes.add(scope);
		if (model && !knownModels.has(model)) {
			issues.push({ path: `${entryPath}.model`, message: `Unknown upstream model: ${model}. Use a provider_model_slug from this catalog.` });
			continue;
		}
		limits.push(limit);
	}
	return { limits, issues };
}

/** Normalizes stored `provider_rate_limits` rows into the catalog contract shape. */
export function rateLimitsFromRows(rows: Array<Record<string, unknown>>): ProviderCatalogRateLimit[] {
	const number = (value: unknown) => value === null || value === undefined ? null : Number(value);
	return rows.map((row) => ({
		model: row.provider_model_slug === ALL_PROVIDER_MODELS ? null : String(row.provider_model_slug),
		...Object.fromEntries(RATE_LIMIT_FIELDS.map((field) => [field, number(row[field])])),
	}) as ProviderCatalogRateLimit).sort((left, right) => left.model === null ? -1 : right.model === null ? 1 : left.model.localeCompare(right.model));
}
