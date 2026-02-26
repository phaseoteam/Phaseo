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

const GOOGLE_THINKING_LEVEL_SUPPORT: Record<string, GoogleThinkingLevel[]> = {
	"gemini-3-flash-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-flash-preview-developer": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-preview-developer": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-preview-thinking-developer": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3-pro-image-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3.1-pro-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
	"gemini-3.1-flash-image-preview": GOOGLE_DEFAULT_GEMINI3_LEVELS,
};

function normalizeModelName(model: string): string {
	return normalizeGoogleModelSlug(String(model ?? "").trim());
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
	return supported[supported.length - 1];
}
