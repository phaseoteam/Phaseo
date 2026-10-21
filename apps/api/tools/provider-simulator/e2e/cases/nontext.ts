// Purpose: End-to-end cases for the non-text endpoint families through the real finaliser.
// Why: The traced audit says TTS is never billed (C1) and speech-to-text is billed from size estimates (H3);
//      only a run through finalizeRequest can confirm or refute that.
// How: One documented provider per family; upstream answers come from e2e/nontext-writers.ts.

import type { CaseDef } from "../types";
import { route } from "./shared";

function bytes(size: number, header: number[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(size);
	out.set(header);
	return out;
}

/** A 320,000-byte MP3: the size estimate (16 kB/s) gives 20 s, while the provider reports 62 s. */
function audioForm(model: string, extra: Record<string, string> = {}): () => FormData {
	return () => {
		const form = new FormData();
		form.append("model", model);
		form.append("file", new File([bytes(320_000, [0x49, 0x44, 0x33, 0x04])], "sim-voice-note.mp3", { type: "audio/mpeg" }));
		for (const [key, value] of Object.entries(extra)) form.append(key, value);
		return form;
	};
}

const TINY_PNG = Uint8Array.from(
	atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
	(char) => char.charCodeAt(0),
);

function nonText(def: Omit<CaseDef, "group" | "upstream" | "mode"> & { upstream?: CaseDef["upstream"] }): CaseDef {
	const providers = Object.values(def.routesByModel).flat().map((entry) => entry.providerId);
	return {
		...def,
		group: "nontext",
		mode: "buffered",
		upstream: def.upstream ?? Object.fromEntries(providers.map((provider) => [provider, [{ kind: "nontext" as const }]])),
	};
}

export function nonTextCases(): CaseDef[] {
	return [
		nonText({
			id: "nontext.embeddings.openai",
			family: "embeddings",
			surface: "embeddings",
			endpoint: "embeddings",
			path: "/v1/embeddings",
			capability: "embeddings",
			routesByModel: { "openai/text-embedding-3-small": [route("openai", "openai/text-embedding-3-small")] },
			body: { model: "openai/text-embedding-3-small", input: ["SIM-E2E-EMBED-0001 first", "SIM-E2E-EMBED-0002 second"] },
			description: "OpenAI embeddings, two inputs",
		}),
		nonText({
			id: "nontext.images.generations.openai",
			family: "images.generations",
			surface: "images.generations",
			endpoint: "images.generations",
			path: "/v1/images/generations",
			capability: "image.generate",
			routesByModel: { "openai/gpt-image-1": [route("openai", "openai/gpt-image-1")] },
			body: { model: "openai/gpt-image-1", prompt: "SIM-E2E-IMAGE-0001 a lighthouse at dusk", size: "1024x1024", quality: "low", n: 1 },
			description: "OpenAI gpt-image-1, low quality 1024x1024, token usage in the response",
		}),
		nonText({
			id: "nontext.images.edits.openai",
			family: "images.edits",
			surface: "images.edits",
			endpoint: "images.edits",
			path: "/v1/images/edits",
			capability: "image.edit",
			routesByModel: { "openai/gpt-image-1": [route("openai", "openai/gpt-image-1")] },
			body: () => {
				const form = new FormData();
				form.append("model", "openai/gpt-image-1");
				form.append("prompt", "SIM-E2E-IMAGE-EDIT-0001 add a red boat");
				form.append("size", "1024x1024");
				form.append("quality", "low");
				form.append("image", new File([TINY_PNG], "sim-input.png", { type: "image/png" }));
				return form;
			},
			description: "OpenAI gpt-image-1 edit (multipart), token usage incl. input image tokens",
		}),
		nonText({
			id: "nontext.audio.speech.openai",
			family: "audio.speech",
			surface: "audio.speech",
			endpoint: "audio.speech",
			path: "/v1/audio/speech",
			capability: "audio.speech",
			routesByModel: { "openai/gpt-4o-mini-tts": [route("openai", "openai/gpt-4o-mini-tts")] },
			body: { model: "openai/gpt-4o-mini-tts", input: "SIM-E2E-SPEECH-0001 the forecast is clear", voice: "alloy" },
			description: "OpenAI gpt-4o-mini-tts, binary audio to the client; upstream SSE carries usage",
		}),
		nonText({
			id: "nontext.audio.transcription.openai-gpt-4o-transcribe",
			family: "audio.transcription",
			surface: "audio.transcription",
			endpoint: "audio.transcription",
			path: "/v1/audio/transcriptions",
			capability: "audio.transcription",
			routesByModel: { "openai/gpt-4o-transcribe": [route("openai", "openai/gpt-4o-transcribe")] },
			body: audioForm("openai/gpt-4o-transcribe"),
			description: "OpenAI gpt-4o-transcribe; provider reports audio and output tokens",
		}),
		nonText({
			id: "nontext.audio.transcription.openai-whisper-1",
			family: "audio.transcription",
			surface: "audio.transcription",
			endpoint: "audio.transcription",
			path: "/v1/audio/transcriptions",
			capability: "audio.transcription",
			routesByModel: { "openai/whisper-1": [route("openai", "openai/whisper-1")] },
			body: audioForm("openai/whisper-1"),
			description: "OpenAI whisper-1; provider reports usage.seconds = 62 for a file the size estimate puts at 20 s",
		}),
		nonText({
			id: "nontext.audio.translations.openai-whisper-1",
			family: "audio.translations",
			surface: "audio.translations",
			endpoint: "audio.translations",
			path: "/v1/audio/translations",
			capability: "audio.translations",
			routesByModel: { "openai/whisper-1": [route("openai", "openai/whisper-1")] },
			body: audioForm("openai/whisper-1"),
			description: "OpenAI whisper-1 translation; provider reports usage.seconds = 62",
		}),
		nonText({
			id: "nontext.moderations.openai",
			family: "moderations",
			surface: "moderations",
			endpoint: "moderations",
			path: "/v1/moderations",
			capability: "moderations",
			routesByModel: { "openai/omni-moderation": [route("openai", "openai/omni-moderation")] },
			body: { model: "openai/omni-moderation", input: "SIM-E2E-MODERATE-0001 a friendly sentence" },
			description: "OpenAI omni-moderation (free route)",
		}),
		nonText({
			id: "nontext.rerank.cohere",
			family: "rerank",
			surface: "rerank",
			endpoint: "rerank",
			path: "/v1/rerank",
			capability: "rerank",
			routesByModel: { "cohere/rerank-v3.5": [route("cohere", "cohere/rerank-v3.5")] },
			body: {
				model: "cohere/rerank-v3.5",
				query: "SIM-E2E-RERANK-QUERY-0001 forecast",
				documents: Array.from({ length: 150 }, (_, index) => `SIM-E2E-DOC-${String(index).padStart(4, "0")} weather note`),
				top_n: 2,
			},
			description: "Cohere rerank-v3.5 with 150 documents (2 search units reported)",
		}),
		nonText({
			id: "nontext.ocr.mistral",
			family: "ocr",
			surface: "ocr",
			endpoint: "ocr",
			path: "/v1/ocr",
			capability: "ocr",
			routesByModel: { "mistral/ocr-3": [route("mistral", "mistral/ocr-3")] },
			body: { model: "mistral/ocr-3", document: { type: "document_url", document_url: "https://sim.example/sim-report.pdf" } },
			description: "Mistral OCR 3 on a 3-page document",
		}),
		nonText({
			id: "nontext.video.openai-sora-2-submit",
			family: "video.generate",
			surface: "video.generation",
			endpoint: "video.generation",
			path: "/v1/videos",
			capability: "video.generate",
			routesByModel: { "openai/sora-2": [route("openai", "openai/sora-2")] },
			body: { model: "openai/sora-2", prompt: "SIM-E2E-VIDEO-0001 waves on a beach", seconds: "8", size: "1280x720" },
			description: "OpenAI sora-2 submission only (the job stays queued)",
		}),
	];
}
