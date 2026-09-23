import { describe, expect, it } from "vitest";
import { encodeNonTextResponse } from "./non-text";

describe("non-text audio speech usage encoding", () => {
	it("promotes Gemini TTS IR usage into billable text, cache, and audio meters", () => {
		const encoded = encodeNonTextResponse(
			"audio.speech",
			{
				model: "google/gemini-3.8-flash-tts",
				provider: "google-ai-studio",
				audio: { data: "QUJD", mimeType: "audio/wav" },
				usage: {
					inputTokens: 11,
					outputTokens: 7,
					totalTokens: 18,
					cachedInputTokens: 3,
					cachedReadTokensAreSubsetOfInput: true,
					_ext: { outputAudioTokens: 7 },
				},
			} as any,
			"req_gemini_tts_billing",
		);

		expect(encoded.usage).toMatchObject({
			input_tokens: 11,
			output_tokens: 7,
			total_tokens: 18,
			input_text_tokens: 8,
			cached_read_text_tokens: 3,
			output_audio_tokens: 7,
		});
		expect(encoded.usage.output_text_tokens).toBeUndefined();
	});

	it("treats coarse Gemini speech output tokens as audio when modality details are absent", () => {
		const encoded = encodeNonTextResponse(
			"audio.speech",
			{
				model: "google/gemini-3.8-flash-lite-tts",
				provider: "google-ai-studio",
				audio: { data: "QUJD", mimeType: "audio/wav" },
				usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
			} as any,
			"req_gemini_tts_coarse_billing",
		);

		expect(encoded.usage).toMatchObject({
			input_text_tokens: 11,
			output_audio_tokens: 7,
		});
	});
});
