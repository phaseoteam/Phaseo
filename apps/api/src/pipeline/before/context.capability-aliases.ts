const MODERATION_CONTEXT_CAPABILITY_ALIASES = [
	"moderations",
	"moderations.create",
	"text.moderate",
	"moderation",
] as const;
const EMBEDDINGS_CONTEXT_CAPABILITY_ALIASES = [
	"embeddings",
	"text.embed",
] as const;
const RERANK_CONTEXT_CAPABILITY_ALIASES = [
	"rerank",
	"rerank.create",
	"text.rerank",
] as const;
const IMAGE_CONTEXT_CAPABILITY_ALIASES = [
	"image.generate",
	"images.generate",
	"images.generations",
] as const;

function normalizeContextCapability(value: string): string {
	return String(value ?? "").trim().toLowerCase();
}

function isGoogleImageGenerationModel(model: string | null | undefined): boolean {
	const normalized = String(model ?? "").trim().toLowerCase();
	if (!normalized.startsWith("google/")) return false;
	return (
		normalized.includes("image") ||
		normalized.includes("imagen") ||
		normalized.includes("nano-banana")
	);
}

export function getContextCapabilityCandidates(capability: string, model?: string): string[] {
	const normalized = normalizeContextCapability(capability);
	if (!normalized) return [];
	if (
		MODERATION_CONTEXT_CAPABILITY_ALIASES.includes(
			normalized as (typeof MODERATION_CONTEXT_CAPABILITY_ALIASES)[number],
		)
	) {
		return Array.from(new Set<string>([
			normalized,
			...MODERATION_CONTEXT_CAPABILITY_ALIASES,
		]));
	}
	if (
		EMBEDDINGS_CONTEXT_CAPABILITY_ALIASES.includes(
			normalized as (typeof EMBEDDINGS_CONTEXT_CAPABILITY_ALIASES)[number],
		)
	) {
		return Array.from(new Set<string>([
			normalized,
			...EMBEDDINGS_CONTEXT_CAPABILITY_ALIASES,
		]));
	}
	if (
		RERANK_CONTEXT_CAPABILITY_ALIASES.includes(
			normalized as (typeof RERANK_CONTEXT_CAPABILITY_ALIASES)[number],
		)
	) {
		return Array.from(new Set<string>([
			normalized,
			...RERANK_CONTEXT_CAPABILITY_ALIASES,
		]));
	}
	if (
		IMAGE_CONTEXT_CAPABILITY_ALIASES.includes(
			normalized as (typeof IMAGE_CONTEXT_CAPABILITY_ALIASES)[number],
		)
	) {
		const candidates = [
			normalized,
			...IMAGE_CONTEXT_CAPABILITY_ALIASES,
		];
		if (isGoogleImageGenerationModel(model)) {
			candidates.push("text.generate");
		}
		return Array.from(new Set<string>(candidates));
	}
	return [normalized];
}
