// Purpose: Native provider responses for the non-text endpoint families (embeddings, images, audio, moderation, rerank, OCR, video).
// Why: src/dialects.ts only writes text dialects; the end-to-end harness must feed every family a documented response.
// How: The writer is chosen from the captured URL path; usage values are distinct sentinels so each can be traced into a meter.

import type { CapturedRequest } from "../src/fetch-capture";

/** Usage sentinels for non-text families. Every value is unique. */
export const NONTEXT_USAGE = {
	embeddingTokens: 1_207,
	imageInputText: 57,
	imageInputImage: 323,
	imageOutputTokens: 272,
	speechInputTokens: 31,
	speechOutputTokens: 1_337,
	transcribeAudioTokens: 1_511,
	transcribeOutputTokens: 87,
	whisperSeconds: 62,
	rerankSearchUnits: 2,
	ocrPages: 3,
	videoSeconds: 8,
} as const;

const TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "x-request-id": "sim-upstream-req-nt-0001", ...headers } });
}

function sse(events: unknown[]): Response {
	const text = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
	return new Response(text, { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "sim-upstream-req-nt-0001" } });
}

// https://platform.openai.com/docs/api-reference/embeddings/object
function openAIEmbeddings(call: CapturedRequest): Response {
	const inputs = Array.isArray(call.bodyJson?.input) ? call.bodyJson.input : [call.bodyJson?.input];
	return json({
		object: "list",
		data: inputs.map((_: unknown, index: number) => ({ object: "embedding", index, embedding: [0.0123, -0.0456, 0.0789] })),
		model: call.bodyJson?.model ?? "sim-embedding-model",
		usage: { prompt_tokens: NONTEXT_USAGE.embeddingTokens, total_tokens: NONTEXT_USAGE.embeddingTokens },
	});
}

// https://platform.openai.com/docs/api-reference/images/object (GPT image models report token usage)
function openAIImages(edit: boolean): Response {
	const inputImage = edit ? NONTEXT_USAGE.imageInputImage : 0;
	return json({
		created: 1_760_000_000,
		background: "opaque",
		output_format: "png",
		quality: "low",
		size: "1024x1024",
		data: [{ b64_json: TINY_PNG_B64 }],
		usage: {
			input_tokens: NONTEXT_USAGE.imageInputText + inputImage,
			input_tokens_details: { text_tokens: NONTEXT_USAGE.imageInputText, image_tokens: inputImage },
			output_tokens: NONTEXT_USAGE.imageOutputTokens,
			total_tokens: NONTEXT_USAGE.imageInputText + inputImage + NONTEXT_USAGE.imageOutputTokens,
		},
	});
}

// https://platform.openai.com/docs/api-reference/audio/speech-audio-delta-event and speech-audio-done-event
function openAISpeech(call: CapturedRequest): Response {
	if (call.bodyJson?.stream_format === "sse") {
		return sse([
			{ type: "speech.audio.delta", audio: "SUQzBAAAAAAA" },
			{ type: "speech.audio.delta", audio: "U0lNLUFVRElP" },
			{
				type: "speech.audio.done",
				usage: {
					input_tokens: NONTEXT_USAGE.speechInputTokens,
					output_tokens: NONTEXT_USAGE.speechOutputTokens,
					total_tokens: NONTEXT_USAGE.speechInputTokens + NONTEXT_USAGE.speechOutputTokens,
				},
			},
		]);
	}
	const bytes = new Uint8Array(256).fill(0x55);
	return new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg", "x-request-id": "sim-upstream-req-nt-0001" } });
}

// https://platform.openai.com/docs/api-reference/audio/json-object (gpt-4o-transcribe token usage; whisper-1 duration usage)
function openAITranscription(call: CapturedRequest, translation: boolean): Response {
	const model = /model=([^&]+)/.exec(call.bodyText ?? "")?.[1] ?? "";
	if (/gpt-4o/.test(model)) {
		return json({
			text: "SIM-TRANSCRIPT-0001 the forecast is clear",
			usage: {
				type: "tokens",
				input_tokens: NONTEXT_USAGE.transcribeAudioTokens,
				input_token_details: { text_tokens: 0, audio_tokens: NONTEXT_USAGE.transcribeAudioTokens },
				output_tokens: NONTEXT_USAGE.transcribeOutputTokens,
				total_tokens: NONTEXT_USAGE.transcribeAudioTokens + NONTEXT_USAGE.transcribeOutputTokens,
			},
		});
	}
	return json({
		text: translation ? "SIM-TRANSLATION-0001 the forecast is clear" : "SIM-TRANSCRIPT-0001 the forecast is clear",
		usage: { type: "duration", seconds: NONTEXT_USAGE.whisperSeconds },
	});
}

// https://platform.openai.com/docs/api-reference/moderations/object
function openAIModerations(call: CapturedRequest): Response {
	return json({
		id: "modr-SIM-0001",
		model: call.bodyJson?.model ?? "omni-moderation-latest",
		results: [{
			flagged: false,
			categories: { harassment: false, violence: false },
			category_scores: { harassment: 0.0011, violence: 0.0013 },
			category_applied_input_types: { harassment: ["text"], violence: ["text"] },
		}],
	});
}

// https://docs.cohere.com/reference/rerank (v2): meta.billed_units.search_units
function cohereRerank(call: CapturedRequest): Response {
	const documents = Array.isArray(call.bodyJson?.documents) ? call.bodyJson.documents.length : 2;
	return json({
		id: "SIM-RERANK-0001",
		results: [{ index: Math.min(1, documents - 1), relevance_score: 0.91 }, { index: 0, relevance_score: 0.13 }],
		meta: { api_version: { version: "2" }, billed_units: { search_units: NONTEXT_USAGE.rerankSearchUnits } },
	});
}

// https://docs.mistral.ai/api/#tag/ocr (OCRResponse: pages[], model, usage_info.pages_processed)
function mistralOcr(call: CapturedRequest): Response {
	const pages = Array.from({ length: NONTEXT_USAGE.ocrPages }, (_, index) => ({
		index,
		markdown: `SIM-OCR-PAGE-${index}`,
		images: [],
		dimensions: { dpi: 200, height: 2200, width: 1700 },
	}));
	return json({ pages, model: call.bodyJson?.model ?? "mistral-ocr-2512", usage_info: { pages_processed: NONTEXT_USAGE.ocrPages, doc_size_bytes: 12_345 } });
}

// https://platform.openai.com/docs/api-reference/videos/create (VideoJob)
function openAIVideo(call: CapturedRequest): Response {
	return json({
		id: "video_SIM_0001",
		object: "video",
		created_at: 1_760_000_000,
		status: "queued",
		model: call.bodyJson?.model ?? "sora-2",
		progress: 0,
		seconds: String(NONTEXT_USAGE.videoSeconds),
		size: "1280x720",
	});
}

/** Picks the writer from the request path. Unknown paths return a 404 so a wrong upstream URL is visible. */
export function nonTextResponse(call: CapturedRequest, provider: string, _variant?: string): Response {
	const pathname = new URL(call.url).pathname;
	if (/\/embeddings$/.test(pathname)) return openAIEmbeddings(call);
	if (/\/images\/generations$/.test(pathname)) return openAIImages(false);
	if (/\/images\/edits$/.test(pathname)) return openAIImages(true);
	if (/\/audio\/speech$/.test(pathname)) return openAISpeech(call);
	if (/\/audio\/transcriptions$/.test(pathname)) return openAITranscription(call, false);
	if (/\/audio\/translations$/.test(pathname)) return openAITranscription(call, true);
	if (/\/moderations$/.test(pathname)) return openAIModerations(call);
	if (/\/rerank$/.test(pathname)) return cohereRerank(call);
	if (/\/ocr$/.test(pathname)) return mistralOcr(call);
	if (/\/videos$/.test(pathname)) return openAIVideo(call);
	return json({ error: { message: `SIM: no non-text writer for ${provider} ${pathname}`, type: "invalid_request_error" } }, 404);
}
