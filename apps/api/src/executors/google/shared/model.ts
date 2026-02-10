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
};

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
	return [primary];
}
