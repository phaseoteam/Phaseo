import { describe, expect, it } from "vitest";
import {
	decodeOpenAIVideoRequestToIR,
	encodeVideoIRToOpenAIResponse,
} from "./video-codec";

describe("video codec (OpenAI edge shape <-> video IR)", () => {
	it("decodes custom video request shape with image_url content parts into video IR", () => {
		const ir = decodeOpenAIVideoRequestToIR({
			model: "google/veo-3.1-fast-preview",
			prompt: "Cinematic mountain flight",
			duration: 8,
			size: "1280x720",
			aspect_ratio: "16:9",
			sample_count: 2,
			input_references: [
				{
					type: "image_url",
					image_url: {
						url: "https://example.com/reference.png",
					},
				},
				{
					type: "image_url",
					role: "reference",
					reference_type: "style",
					image_url: {
						url: "https://example.com/style.png",
					},
				},
			],
			generate_audio: true,
			enhance_prompt: true,
		});

		expect(ir.model).toBe("google/veo-3.1-fast-preview");
		expect(ir.prompt).toContain("Cinematic");
		expect(ir.seconds).toBe(8);
		expect(ir.size).toBe("1280x720");
		expect(ir.resolution).toBe("1280x720");
		expect(ir.inputReference).toBe("https://example.com/reference.png");
		expect(ir.aspectRatio).toBe("16:9");
		expect(ir.numberOfVideos).toBe(2);
		expect(Array.isArray(ir.referenceImages)).toBe(true);
		expect(ir.generateAudio).toBe(true);
		expect(ir.enhancePrompt).toBe(true);
		expect(ir.outputAccess).toBe("both");
	});

	it("maps provider params and output/webhook controls into video IR", () => {
		const ir = decodeOpenAIVideoRequestToIR({
			model: "google/veo-3.1-generate-preview",
			prompt: "A wide landscape sunrise.",
			aspect_ratio: "21:9",
			compression_quality: 85,
			duration: 7,
			generate_audio: true,
			negative_prompt: "low detail",
			resolution: "1080p",
			output: {
				access: "signed_url",
			},
			webhook: {
				url: "https://example.com/callback",
				events: ["video.completed"],
			},
			provider_params: {
				storageUri: "gs://bucket/output/",
			},
		});

		expect(ir.aspectRatio).toBe("21:9");
		expect(ir.compressionQuality).toBe(85);
		expect(ir.durationSeconds).toBe(7);
		expect(ir.generateAudio).toBe(true);
		expect(ir.negativePrompt).toBe("low detail");
		expect(ir.size).toBe("1080p");
		expect(ir.resolution).toBe("1080p");
		expect(ir.outputAccess).toBe("signed_url");
		expect(ir.callbackUrl).toBe("https://example.com/callback");
		expect(ir.outputStorageUri).toBe("gs://bucket/output/");
	});

	it("encodes video IR response back to public video job shape", () => {
		const response = encodeVideoIRToOpenAIResponse(
			{
				id: "req_123",
				nativeId: "op_abc",
				model: "google/veo-3.1-generate-preview",
				provider: "google-ai-studio",
				status: "queued",
			},
			"req_123",
		);

		expect(response.id).toBe("req_123");
		expect(response.status).toBe("pending");
		expect(response.polling_url).toBe("/v1/videos/req_123");
	});
});
