// Keep aligned with public.canonical_routing_capability_id; the parity test
// checks every SQL alias and canonical identifier.
const aliases: Record<string, string> = {
	"image.generations": "image.generate", "image.edits": "image.edit",
	"decision.make": "decisions.make", systemone: "decisions.make", "system.one": "decisions.make", "typed.decisions": "decisions.make",
	"audio.translation": "audio.translations", "batch.create": "batch", "document.parse": "parse", videos: "video.generate",
	"audio.transcribe": "audio.transcription", "audio.transcriptions": "audio.transcription", embeddings: "text.embed",
	rerank: "text.rerank", "rerank.create": "text.rerank", "images.generations": "image.generate", "images.generate": "image.generate", "images.edits": "image.edit",
	realtime: "audio.realtime", "chat.completions": "text.generate", responses: "text.generate", messages: "text.generate", "chat.generate": "text.generate",
	moderations: "text.moderate", "moderations.create": "text.moderate", moderation: "text.moderate", "audio.translate": "audio.translations",
	"video.generation": "video.generate", "video.generations": "video.generate",
};
const canonical = new Set([
	"text.generate", "text.embed", "text.rerank", "text.moderate", "image.generate", "image.edit", "image.vary", "video.generate", "video.edit",
	"audio.speech", "audio.transcription", "audio.translations", "audio.realtime", "music.generate", "decisions.make", "extraction.extract", "ocr", "parse", "batch",
	"tool.call", "structured.output", "voice.design",
]);
export function canonicalCatalogCapability(id: string): string | null {
	const normalized = id.trim().toLowerCase().replaceAll("/", ".");
	return aliases[normalized] ?? (canonical.has(normalized) ? normalized : null);
}
