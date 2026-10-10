const CAPABILITY_GROUPS: Record<string, string> = {
	"text.generate": "text",
	responses: "text",
	"chat.completions": "text",
	messages: "text",
	completions: "text",
	"audio.transcribe": "audio_stt",
	"audio.transcription": "audio_stt",
	"audio.transcriptions": "audio_stt",
	"audio.speech": "audio_tts",
	"audio.realtime": "realtime",
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
};

/** Add capability-based groups without changing the model's actual outputs. */
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
	return groups;
}
