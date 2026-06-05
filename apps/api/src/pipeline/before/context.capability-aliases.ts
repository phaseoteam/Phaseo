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
const AUDIO_SPEECH_CONTEXT_CAPABILITY_ALIASES = [
	"audio.speech",
	"audio.generate",
] as const;
const TEXT_CONTEXT_CAPABILITY_ALIASES = [
	"responses",
	"chat.completions",
	"messages",
	"text.generate",
	"chat.generate",
	"text",
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
		TEXT_CONTEXT_CAPABILITY_ALIASES.includes(
			normalized as (typeof TEXT_CONTEXT_CAPABILITY_ALIASES)[number],
		)
	) {
		const remaining = TEXT_CONTEXT_CAPABILITY_ALIASES.filter(
			alias => alias !== "text.generate" && alias !== normalized,
		);
		return Array.from(new Set<string>([
			"text.generate",
			normalized,
			...remaining,
		]));
	}
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
	if (
		AUDIO_SPEECH_CONTEXT_CAPABILITY_ALIASES.includes(
			normalized as (typeof AUDIO_SPEECH_CONTEXT_CAPABILITY_ALIASES)[number],
		)
	) {
		return Array.from(new Set<string>([
			normalized,
			...AUDIO_SPEECH_CONTEXT_CAPABILITY_ALIASES,
		]));
	}
	return [normalized];
}
