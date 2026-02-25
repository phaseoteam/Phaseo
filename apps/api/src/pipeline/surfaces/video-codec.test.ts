import { describe, expect, it } from "vitest";
import {
	decodeOpenAIVideoRequestToIR,
	encodeVideoIRToOpenAIResponse,
} from "./video-codec";

describe("video codec (OpenAI edge shape <-> video IR)", () => {
	it("decodes OpenAI-style request plus Veo superset options into video IR", () => {
		const ir = decodeOpenAIVideoRequestToIR({
			model: "google/veo-3.1-generate-preview",
			prompt: "Cinematic mountain flight",
			seconds: 8,
			size: "1280x720",
			input_reference: "https://example.com/reference.png",
			aspect_ratio: "16:9",
			number_of_videos: 2,
			reference_images: [{ reference_type: "style", uri: "gs://bucket/style.png" }],
			generate_audio: true,
			enhance_prompt: true,
		});

		expect(ir.model).toBe("google/veo-3.1-generate-preview");
		expect(ir.prompt).toContain("Cinematic");
		expect(ir.seconds).toBe(8);
		expect(ir.size).toBe("1280x720");
		expect(ir.inputReference).toBe("https://example.com/reference.png");
		expect(ir.aspectRatio).toBe("16:9");
		expect(ir.numberOfVideos).toBe(2);
		expect(Array.isArray(ir.referenceImages)).toBe(true);
		expect(ir.generateAudio).toBe(true);
		expect(ir.enhancePrompt).toBe(true);
	});

	it("supports provider-scoped google options via config.google without requiring top-level extras", () => {
		const ir = decodeOpenAIVideoRequestToIR({
			model: "google/veo-3.1-generate-preview",
			prompt: "A wide landscape sunrise.",
			config: {
				google: {
					aspectRatio: "21:9",
					compressionQuality: 85,
					durationSeconds: 7,
					generateAudio: true,
					negativePrompt: "low detail",
					resolution: "1080p",
				},
			},
		});

		expect(ir.aspectRatio).toBe("21:9");
		expect(ir.compressionQuality).toBe(85);
		expect(ir.durationSeconds).toBe(7);
		expect(ir.generateAudio).toBe(true);
		expect(ir.negativePrompt).toBe("low detail");
		expect(ir.resolution).toBe("1080p");
	});

	it("encodes video IR response back to OpenAI-style response shape", () => {
		const response = encodeVideoIRToOpenAIResponse(
			{
				id: "req_123",
				nativeId: "op_abc",
				model: "google/veo-3.1-generate-preview",
				provider: "google",
				status: "queued",
				output: [{ uri: "gs://bucket/video.mp4" }],
				result: { operation_name: "operations/123" },
				usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
			},
			"req_123",
		);

		expect(response.id).toBe("op_abc");
		expect(response.object).toBe("video");
		expect(response.status).toBe("queued");
		expect(response.model).toBe("google/veo-3.1-generate-preview");
		expect(response.provider).toBe("google");
		expect(Array.isArray(response.output)).toBe(true);
		expect(response.usage).toEqual({
			input_tokens: 1,
			output_tokens: 2,
			total_tokens: 3,
		});
	});
});
