// Generated from packages/shared/workspace-routing-settings/index.ts by scripts/sync-workspace-routing-settings.mjs. Do not edit.
// Workspace routing settings: the auto-router's limits (Settings → Routing →
// Auto) and successor routing for models no provider serves any more.
//
// This is the one definition of what a valid setting is. The settings API and
// the gateway's /v1 control plane each use a generated copy
// (scripts/sync-workspace-routing-settings.mjs), so the dashboard and the API
// cannot accept different values. Keep it dependency-free.

export const AUTO_ROUTING_OBJECTIVES = new Set(["balanced", "quality", "cost", "latency"]);
export const AUTO_ROUTING_SPEND_PROFILES = new Set(["economy", "standard", "premium", "unrestricted", "custom"]);
export const MAX_AUTO_ROUTING_PATTERNS = 16;
export const AUTO_ROUTING_COLUMNS = "auto_routing_allowed_patterns,auto_routing_spend_profile,auto_routing_max_input_price_per_million,auto_routing_max_output_price_per_million,auto_routing_objective,auto_routing_fallbacks_enabled,auto_routing_revision,auto_routing_updated_at";

export type AutoRouting = {
	allowedPatterns: string[];
	spendProfile: string;
	maxInputPricePerMillion: number | null;
	maxOutputPricePerMillion: number | null;
	objective: string;
	allowFallbacks: boolean;
	revision: string | null;
	updatedAt: string | null;
};

export function cleanAutoRoutingPatterns(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value
		.map((pattern) => typeof pattern === "string" ? pattern.trim().toLowerCase() : "")
		.filter(Boolean))]
		.slice(0, MAX_AUTO_ROUTING_PATTERNS);
}

export function autoRoutingPriceLimit(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}

export function autoRoutingFromRow(row: any): AutoRouting {
	const objective = String(row?.auto_routing_objective ?? "balanced");
	const spendProfile = String(row?.auto_routing_spend_profile ?? "standard");
	return {
		allowedPatterns: cleanAutoRoutingPatterns(row?.auto_routing_allowed_patterns),
		spendProfile: AUTO_ROUTING_SPEND_PROFILES.has(spendProfile) ? spendProfile : "standard",
		maxInputPricePerMillion: autoRoutingPriceLimit(row?.auto_routing_max_input_price_per_million),
		maxOutputPricePerMillion: autoRoutingPriceLimit(row?.auto_routing_max_output_price_per_million),
		objective: AUTO_ROUTING_OBJECTIVES.has(objective) ? objective : "balanced",
		allowFallbacks: row?.auto_routing_fallbacks_enabled !== false,
		revision: typeof row?.auto_routing_revision === "string" ? row.auto_routing_revision : null,
		updatedAt: typeof row?.auto_routing_updated_at === "string" ? row.auto_routing_updated_at : null,
	};
}

export type AutoRoutingUpdateError =
	| { error: "invalid_model_patterns"; patterns: string[]; maximum: number }
	| { error: "invalid_objective" }
	| { error: "invalid_spend_profile" }
	| { error: "custom_price_limits_required" };

/**
 * The workspace_settings columns for a full auto-routing update (camelCase
 * fields as the settings page sends them), or why it is refused. Each save
 * gets a new revision so cached routing decisions are dropped.
 */
export function parseAutoRoutingUpdate(
	body: Record<string, unknown>,
	now = new Date().toISOString(),
): { ok: true; value: Record<string, unknown> } | { ok: false; error: AutoRoutingUpdateError } {
	const rawPatterns = Array.isArray(body.allowedPatterns) ? body.allowedPatterns : [];
	const allowedPatterns = cleanAutoRoutingPatterns(rawPatterns);
	const invalidPatterns = rawPatterns
		.map((pattern) => String(pattern ?? "").trim().toLowerCase())
		.filter((pattern) => !pattern || pattern.length > 200 || !/^[a-z0-9*][a-z0-9._:/*-]*$/.test(pattern) || !pattern.includes("/"));
	const objective = String(body.objective ?? "balanced").trim().toLowerCase();
	const spendProfile = String(body.spendProfile ?? "standard").trim().toLowerCase();
	const maxInputPricePerMillion = autoRoutingPriceLimit(body.maxInputPricePerMillion);
	const maxOutputPricePerMillion = autoRoutingPriceLimit(body.maxOutputPricePerMillion);
	if (rawPatterns.length > MAX_AUTO_ROUTING_PATTERNS || invalidPatterns.length) {
		return { ok: false, error: { error: "invalid_model_patterns", patterns: invalidPatterns, maximum: MAX_AUTO_ROUTING_PATTERNS } };
	}
	if (!AUTO_ROUTING_OBJECTIVES.has(objective)) return { ok: false, error: { error: "invalid_objective" } };
	if (!AUTO_ROUTING_SPEND_PROFILES.has(spendProfile)) return { ok: false, error: { error: "invalid_spend_profile" } };
	if (spendProfile === "custom" && (maxInputPricePerMillion === null || maxOutputPricePerMillion === null)) {
		return { ok: false, error: { error: "custom_price_limits_required" } };
	}
	return {
		ok: true,
		value: {
			auto_routing_allowed_patterns: allowedPatterns,
			auto_routing_spend_profile: spendProfile,
			auto_routing_max_input_price_per_million: spendProfile === "custom" ? maxInputPricePerMillion : null,
			auto_routing_max_output_price_per_million: spendProfile === "custom" ? maxOutputPricePerMillion : null,
			auto_routing_objective: objective,
			auto_routing_fallbacks_enabled: body.allowFallbacks !== false,
			auto_routing_revision: crypto.randomUUID(),
			auto_routing_updated_at: now,
			updated_at: now,
		},
	};
}

export const SUCCESSOR_PRICE_POLICIES = new Set(["never", "limit", "any"]);
/** The gateway only redirects to models it can list; anything else would be saved and never used. */
export const SERVABLE_SUCCESSOR_STATUSES = new Set(["active", "deprecated", "retired"]);
export const MAX_SUCCESSOR_REPLACEMENTS = 500;
export const MAX_SUCCESSOR_PRICE_INCREASE_PERCENT = 1000;

export function successorModelSlug(value: unknown): string | null {
	const slug = String(value ?? "").trim().toLowerCase();
	return slug && slug.length <= 512 && /^[a-z0-9][a-z0-9._:/+@-]*$/.test(slug) ? slug : null;
}

export type SuccessorReplacementError = "invalid_model" | "invalid_successor" | "successor_is_model";

/** A replacement to save. successor null means "never redirect this model". */
export function parseSuccessorReplacement(body: Record<string, unknown>):
	| { ok: true; value: { model: string; successor: string | null } }
	| { ok: false; error: SuccessorReplacementError } {
	const model = successorModelSlug(body.model);
	const successor = body.successor === null ? null : successorModelSlug(body.successor);
	if (!model) return { ok: false, error: "invalid_model" };
	if (body.successor !== null && !successor) return { ok: false, error: "invalid_successor" };
	if (successor === model) return { ok: false, error: "successor_is_model" };
	return { ok: true, value: { model, successor } };
}

/** Why a replacement cannot be saved given the catalogue statuses of its models (slug → status, visible models only). */
export function successorReplacementCatalogueError(
	replacement: { model: string; successor: string | null },
	statuses: Map<string, string>,
): "unknown_model" | "unknown_successor" | "inactive_successor" | null {
	if (!statuses.has(replacement.model)) return "unknown_model";
	if (replacement.successor && !statuses.has(replacement.successor)) return "unknown_successor";
	if (replacement.successor && !SERVABLE_SUCCESSOR_STATUSES.has(statuses.get(replacement.successor)!)) return "inactive_successor";
	return null;
}

export type SuccessorSettingsError = "invalid_enabled" | "invalid_price_policy" | "invalid_max_price_increase_percent";

/** The workspace_settings columns for a successor routing settings update. */
export function parseSuccessorSettings(body: Record<string, unknown>):
	| { ok: true; value: Record<string, unknown> }
	| { ok: false; error: SuccessorSettingsError } {
	const pricePolicy = String(body.pricePolicy ?? "never");
	const percent = Number(body.maxPriceIncreasePercent ?? 0);
	if (typeof body.enabled !== "boolean") return { ok: false, error: "invalid_enabled" };
	if (!SUCCESSOR_PRICE_POLICIES.has(pricePolicy)) return { ok: false, error: "invalid_price_policy" };
	if (!Number.isInteger(percent) || percent < 0 || percent > MAX_SUCCESSOR_PRICE_INCREASE_PERCENT) {
		return { ok: false, error: "invalid_max_price_increase_percent" };
	}
	return {
		ok: true,
		value: {
			model_successor_redirect_enabled: body.enabled,
			model_successor_price_policy: pricePolicy,
			model_successor_max_price_increase_percent: pricePolicy === "limit" ? percent : 0,
		},
	};
}

export function successorSettingsFromRow(row: any) {
	const pricePolicy = String(row?.model_successor_price_policy ?? "never");
	return {
		enabled: row?.model_successor_redirect_enabled === true,
		pricePolicy: SUCCESSOR_PRICE_POLICIES.has(pricePolicy) ? pricePolicy : "never",
		maxPriceIncreasePercent: Number(row?.model_successor_max_price_increase_percent ?? 0) || 0,
	};
}
