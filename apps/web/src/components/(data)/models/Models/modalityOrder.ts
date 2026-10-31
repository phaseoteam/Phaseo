// The order modalities appear in on the models page: the filter chips, the
// sidebar and each model's modality icons all follow it.
export const OUTPUT_MODALITY_DISPLAY_ORDER = [
	"text",
	"image",
	"video",
	"audio",
	"embeddings",
	"decisions",
	"decision",
	"extraction",
	"moderations",
	"rerank",
	"documents",
	"audio_tts",
	"audio_stt",
	"translation",
	"realtime",
	"audio_music",
] as const;

export function normalizeModalityFilterValue(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._/-]+/g, " ");
	if (!normalized) return "";
	if (normalized.includes("realtime") || normalized.includes("real time")) {
		return "realtime";
	}
	if (/\bocr\b/.test(normalized) || /\bpars(e|ing)\b/.test(normalized)) {
		return "documents";
	}
	if (normalized.includes("translat")) return "translation";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcri") ||
		normalized.includes("speech to text") ||
		normalized.includes("stt")
	) {
		return "audio_stt";
	}
	if (
		normalized.includes("text to speech") ||
		normalized.includes("audio speech") ||
		normalized.includes("speech synth") ||
		normalized.includes("tts")
	) {
		return "audio_tts";
	}
	if (normalized.includes("text")) return "text";
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("file")) return "file";
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("embed")) return "embeddings";
	return normalized.replace(/\s+/g, "_");
}

const modalityOrderIndex = new Map<string, number>(
	OUTPUT_MODALITY_DISPLAY_ORDER.map((value, index) => [value, index] as const),
);

export function compareModalitiesByDisplayOrder(a: string, b: string): number {
	const aIndex = modalityOrderIndex.get(normalizeModalityFilterValue(a));
	const bIndex = modalityOrderIndex.get(normalizeModalityFilterValue(b));
	if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
	if (aIndex !== undefined) return -1;
	if (bIndex !== undefined) return 1;
	return a.localeCompare(b);
}
