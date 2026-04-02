// Purpose: Normalize Google model identifiers for Gemini endpoints.
// Why: Provider rows may miss model slugs, and legacy model ids can be retired.
// How: Convert gateway model ids to Gemini slugs and provide fallback candidates.

const EXPLICIT_MODEL_ALIASES: Record<string, string> = {
	// Canonicalize all Nano Banana v2.5 aliases to stable non-preview slug.
	"google/gemini-2-5-flash-image-preview": "gemini-2.5-flash-image",
	"gemini-2-5-flash-image-preview": "gemini-2.5-flash-image",
	"google/gemini-2.5-flash-image-preview": "gemini-2.5-flash-image",
	"gemini-2.5-flash-image-preview": "gemini-2.5-flash-image",
	"google/gemini-2-5-flash-image": "gemini-2.5-flash-image",
	"gemini-2-5-flash-image": "gemini-2.5-flash-image",
	"google/gemini-2.5-flash-image": "gemini-2.5-flash-image",
	"gemini-2.5-flash-image": "gemini-2.5-flash-image",
	// Accept canonical gateway identifiers for Google Lyria music models.
	"google/lyria-3": "lyria-3",
	"google/lyria-3-pro": "lyria-3-pro",
	"google/lyria-3-pro-preview": "lyria-3-pro-preview",
	"google/lyria-3-clip": "lyria-3-clip",
	"google/lyria-3-clip-preview": "lyria-3-clip-preview",
};

function dedupeCandidates(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const value of values) {
		const trimmed = String(value ?? "").trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(trimmed);
	}
	return out;
}

function lyriaModelCandidates(model: string): string[] {
	const value = String(model ?? "").trim().toLowerCase();
	if (!value) return [];
	if (value === "lyria-3" || value === "lyria-3-preview") {
		return ["lyria-3-pro", "lyria-3-pro-preview", "lyria-3-clip", "lyria-3-clip-preview", "lyria-3"];
	}
	if (value === "lyria-3-pro") return ["lyria-3-pro", "lyria-3-pro-preview"];
	if (value === "lyria-3-pro-preview") return ["lyria-3-pro-preview"];
	if (value === "lyria-3-clip") return ["lyria-3-clip", "lyria-3-clip-preview"];
	if (value === "lyria-3-clip-preview") return ["lyria-3-clip-preview"];
	return [];
}

export function normalizeGoogleModelSlug(model: string): string {
	let value = String(model ?? "").trim();
	if (!value) return value;

	if (value.includes("/")) {
		value = value.split("/").pop() ?? value;
	}

	const alias = EXPLICIT_MODEL_ALIASES[value] ?? EXPLICIT_MODEL_ALIASES[model];
	if (alias) return alias;

	// Convert gateway-style version segments (`gemini-2-5-*`) to Gemini slug style (`gemini-2.5-*`).
	value = value.replace(/^gemini-(\d)-(\d)(?=-)/i, "gemini-$1.$2");
	return value;
}

export function resolveGoogleModelCandidates(model: string): string[] {
	const primary = normalizeGoogleModelSlug(model);
	if (!primary) return [];
	return dedupeCandidates([primary, ...lyriaModelCandidates(primary)]);
}
