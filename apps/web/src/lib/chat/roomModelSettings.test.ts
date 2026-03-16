import {
	buildEmbeddingsRequestOptions,
	buildImageRequestOptions,
	getAudioModelSchema,
	getDefaultEmbeddingsRoomParams,
	getDefaultImageRoomParams,
	getImageModelSchema,
	getModerationThreshold,
} from "@/lib/chat/roomModelSettings";

describe("roomModelSettings", () => {
	it("uses dalle3-specific image options", () => {
		const schema = getImageModelSchema("openai/dall-e-3");
		expect(schema.variant).toBe("dalle3");
		expect(schema.styleOptions).toEqual(["vivid", "natural"]);
		expect(schema.maxCount).toBe(1);
	});

	it("clamps image count to model max", () => {
		const params = getDefaultImageRoomParams("openai/dall-e-3");
		const request = buildImageRequestOptions("openai/dall-e-3", {
			...params,
			n: 99,
		});
		expect(request.n).toBe(1);
	});

	it("exposes extended voices for gpt-4o mini tts", () => {
		const schema = getAudioModelSchema("openai/gpt-4o-mini-tts");
		expect(schema.voiceOptions).toContain("coral");
		expect(schema.voiceOptions).toContain("sage");
	});

	it("embeddings dimensions are clamped by model limits", () => {
		const request = buildEmbeddingsRequestOptions(
			"openai/text-embedding-3-small",
			{
				...getDefaultEmbeddingsRoomParams(),
				dimensions: 9999,
			},
		);
		expect(request.dimensions).toBe(1536);
	});

	it("moderation threshold is normalized", () => {
		expect(getModerationThreshold({ scoreThreshold: -1 })).toBe(0);
		expect(getModerationThreshold({ scoreThreshold: 5 })).toBe(1);
	});
});
