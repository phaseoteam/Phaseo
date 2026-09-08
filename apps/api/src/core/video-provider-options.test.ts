import { describe, expect, it } from "vitest";
import { VideoGenerationSchema } from "./schemas";
import { decodeOpenAIVideoRequestToIR } from "@pipeline/surfaces/video-codec";
import { selectVideoProviderOptions } from "./video-provider-options";

describe("scoped video provider options", () => {
	it("keeps frame roles separate from style references", () => {
		const body = VideoGenerationSchema.parse({
			model: "bytedance/seedance-2.5", prompt: "A forest",
			frame_images: [{ type: "image_url", frame_type: "last_frame", image_url: { url: "https://example.com/end.png" } }],
			input_references: [{ type: "image_url", image_url: { url: "https://example.com/style.png" } }],
		});
		const ir = decodeOpenAIVideoRequestToIR(body);
		expect(ir.lastFrame).toBe("https://example.com/end.png");
		expect(ir.inputImage).toBeUndefined();
		expect(ir.referenceImages).toEqual([{ image: "https://example.com/style.png" }]);
		expect(VideoGenerationSchema.safeParse({ ...body, frame_images: [...body.frame_images!, ...body.frame_images!] }).success).toBe(false);
	});

	it("preserves only the routed provider's extensions through the IR", () => {
		const body = VideoGenerationSchema.parse({
			model: "bytedance/seedance-2.5", prompt: "A forest", duration: 10,
			provider_options: { atlascloud: { watermark: false }, byteplus: { camera_fixed: true } },
		});
		const ir = decodeOpenAIVideoRequestToIR(body);
		expect(selectVideoProviderOptions(ir, "atlascloud").providerParams).toEqual({ watermark: false });
		expect(selectVideoProviderOptions(ir, "byteplus").rawRequest.provider_params).toEqual({ camera_fixed: true });
		expect(selectVideoProviderOptions(ir, "openai").providerParams).toEqual({});
		expect(ir.providerParams).toBeUndefined();
	});

	it.each(["duration", "model", "callback_url", "sample_count", "image_url", "imageUrls", "video_urls", "audioUrl", "end_image_url", "quality", "num_videos"])("rejects controlled %s even inside scoped nested options", (key) => {
		expect(VideoGenerationSchema.safeParse({ prompt: "test", provider_options: { atlascloud: { nested: { [key]: 4 } } } }).success).toBe(false);
	});

	it("rejects conflicting option and duration aliases", () => {
		expect(VideoGenerationSchema.safeParse({ prompt: "test", provider_options: {}, provider_params: {} }).success).toBe(false);
		expect(VideoGenerationSchema.safeParse({ prompt: "test", seconds: "8", duration: 10 }).success).toBe(false);
	});
});
