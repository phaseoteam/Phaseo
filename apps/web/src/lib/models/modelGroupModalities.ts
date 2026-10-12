import { AUDIO_FAMILY_GROUPS } from "./audioFamily";

const CAPABILITY_GROUPS: Record<string, string> = {
	"text.generate": "text",
	responses: "text",
	"chat.completions": "text",
	messages: "text",
	completions: "text",
	"audio.transcribe": "audio_stt",
	"audio.transcription": "audio_stt",
	"audio.transcriptions": "audio_stt",
	"audio.translate": "translation",
	"audio.translation": "translation",
	"audio.translations": "translation",
	"audio.speech": "audio_tts",
	"audio.realtime": "realtime",
	realtime: "realtime",
	"audio.music": "audio_music",
	"music.generate": "audio_music",
	"text.embed": "embeddings",
	embeddings: "embeddings",
	"text.rerank": "rerank",
	rerank: "rerank",
	"text.moderate": "moderations",
	moderations: "moderations",
	"image.generate": "image",
	"image.edit": "image",
	"images.generations": "image",
	"images.edits": "image",
	"video.generate": "video",
	"video.edit": "video",
	"video.generations": "video",
	ocr: "documents",
	parse: "documents",
};

/**
 * Add capability-based groups without changing the model's actual outputs.
 * Every audio sub-type (speech, transcription, translation, realtime, music)
 * also counts as Audio, so the Audio chip covers the whole family even though
 * transcription and translation models only output text.
 */
export function modelGroupModalities(
	outputModalities: ReadonlySet<string>,
	endpoints: readonly string[] | undefined,
): ReadonlySet<string> {
	const groups = new Set(outputModalities);
	for (const endpoint of endpoints ?? []) {
		const capability = endpoint.trim().toLowerCase()
			.replace(/^\/(?:v1\/)?/, "")
			.replace(/[./_-]+/g, ".");
		const group = CAPABILITY_GROUPS[capability];
		if (group) groups.add(group);
	}
	if (AUDIO_FAMILY_GROUPS.some((group) => groups.has(group))) groups.add("audio");
	return groups;
}
