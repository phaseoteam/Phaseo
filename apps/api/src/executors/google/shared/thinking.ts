// Purpose: Model-aware Gemini thinking level support and effort mapping.
// Why: Google models do not all share the same reasoning controls.
// How: Keep explicit support lists and mapping helpers in one place.

import { normalizeGoogleModelSlug } from "./model";

export type GoogleThinkingLevel = "MINIMAL" | "LOW" | "MEDIUM" | "HIGH";

const GOOGLE_DEFAULT_GEMINI3_LEVELS: GoogleThinkingLevel[] = [
	"MINIMAL",
	"LOW",
	"MEDIUM",
	"HIGH",
];

const GOOGLE_GEMMA4_LEVELS: GoogleThinkingLevel[] = ["MINIMAL", "HIGH"];

// No MINIMAL: Google returns a validation error for it on these models.
const GOOGLE_LOW_MEDIUM_HIGH_LEVELS: GoogleThinkingLevel[] = ["LOW", "MEDIUM", "HIGH"];

const GOOGLE_LEVEL_ORDER: GoogleThinkingLevel[] = ["MINIMAL", "LOW", "MEDIUM", "HIGH"];

const GOOGLE_GEMMA4_MODELS = new Set([
	"gemma-4-26b-a4b",
	"gemma-4-31b",
]);

const GOOGLE_THINKING_LEVEL_SUPPORT: Record<string, GoogleThinkingLevel[]> = {
	"gemma-4-26b-a4b": GOOGLE_GEMMA4_LEVELS,
	"gemma-4-31b": GOOGLE_GEMMA4_LEVELS,
	"gemini-3-flash-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-flash-preview-developer": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-preview-developer": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-preview-thinking-developer": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-image-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	// https://ai.google.dev/gemini-api/docs/thinking: 3.1 Pro takes low, medium and high.
	"gemini-3.1-pro-preview": GOOGLE_LOW_MEDIUM_HIGH_LEVELS,
	"gemini-3.1-flash-image-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	// https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash
	"gemini-3.7-flash": GOOGLE_LOW_MEDIUM_HIGH_LEVELS,
	// https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon:
	// "Setting thinking_budget or thinking_level="MINIMAL" returns an HTTP 400 validation error."
	"gemini-4-argon": GOOGLE_LOW_MEDIUM_HIGH_LEVELS,
};

// Models that refuse thinkingBudget and take thinkingLevel only.
const GOOGLE_THINKING_BUDGET_UNSUPPORTED = ["gemini-4-argon"];

function normalizeModelName(model: string): string {
	return normalizeGoogleModelSlug(String(model ?? "").trim()).replace(/:free$/i, "");
}

export function getSupportedGoogleThinkingLevels(model: string): GoogleThinkingLevel[] {
	const normalized = normalizeModelName(model);
	if (!normalized) return [];

	if (normalized in GOOGLE_THINKING_LEVEL_SUPPORT) {
		return [...GOOGLE_THINKING_LEVEL_SUPPORT[normalized]];
	}

	for (const [modelPrefix, levels] of Object.entries(GOOGLE_THINKING_LEVEL_SUPPORT)) {
		if (normalized.startsWith(`${modelPrefix}-`) || normalized.startsWith(`${modelPrefix}_`)) {
			return [...levels];
		}
	}

	// Keep compatibility for newer Gemini 3 variants until explicitly catalogued.
	if (normalized.startsWith("gemini-3")) {
		return [...GOOGLE_DEFAULT_GEMINI3_LEVELS];
	}

	return [];
}

export function modelSupportsGoogleThinkingLevels(model: string): boolean {
	return getSupportedGoogleThinkingLevels(model).length > 0;
}

/** True when the model rejects thinkingBudget, so reasoning must be sent as a thinkingLevel. */
export function modelRejectsGoogleThinkingBudget(model: string): boolean {
	const normalized = normalizeModelName(model);
	return GOOGLE_THINKING_BUDGET_UNSUPPORTED.some(prefix =>
		normalized === prefix || normalized.startsWith(`${prefix}-`) || normalized.startsWith(`${prefix}_`));
}

/** The least thinking a model accepts: MINIMAL where supported, otherwise its lowest level. */
export function getLowestGoogleThinkingLevel(model: string): GoogleThinkingLevel | undefined {
	return getSupportedGoogleThinkingLevels(model)[0];
}

export function getDefaultGoogleThinkingLevel(model: string): GoogleThinkingLevel | undefined {
	const normalized = normalizeModelName(model).replace(/-it$/i, "");
	return GOOGLE_GEMMA4_MODELS.has(normalized) ? "MINIMAL" : undefined;
}

function effortToThinkingLevel(effort: string): GoogleThinkingLevel | undefined {
	switch (effort) {
		case "minimal":
			return "MINIMAL";
		case "low":
			return "LOW";
		case "medium":
			return "MEDIUM";
		case "high":
		case "xhigh":
		case "max":
			return "HIGH";
		default:
			return undefined;
	}
}

export function resolveGoogleThinkingLevelForEffort(
	model: string,
	effort: string | undefined,
): GoogleThinkingLevel | undefined {
	if (!effort) return undefined;
	const mapped = effortToThinkingLevel(effort);
	if (!mapped) return undefined;

	const supported = getSupportedGoogleThinkingLevels(model);
	if (supported.length === 0) return undefined;
	if (supported.includes(mapped)) return mapped;
	// The nearest supported level, so "minimal" becomes LOW where MINIMAL is rejected.
	const rank = (level: GoogleThinkingLevel) => GOOGLE_LEVEL_ORDER.indexOf(level);
	return supported.reduce((best, level) =>
		Math.abs(rank(level) - rank(mapped)) < Math.abs(rank(best) - rank(mapped)) ? level : best);
}
