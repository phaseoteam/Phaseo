import {
	buildEmbeddingsMultimodalInput,
	buildModerationInput,
	extractEmbeddingVectors,
	extractGenerationUrls,
	normalizeModerationResult,
	projectVectorsPca2d,
	splitEmbeddingTextInput,
} from "@/lib/chat/roomRequestBuilders";

describe("chat room request builders", () => {
	it("builds moderation input for text and image payloads", () => {
		expect(buildModerationInput({ text: "hello" })).toBe("hello");
		expect(
			buildModerationInput({
				text: "hello",
				imageUrls: ["https://example.com/a.png"],
			}),
		).toEqual([
			{ type: "text", text: "hello" },
			{
				type: "image_url",
				image_url: { url: "https://example.com/a.png" },
			},
		]);
	});

	it("builds multimodal embeddings content blocks", () => {
		expect(
			buildEmbeddingsMultimodalInput([
				{ type: "input_text", text: "hello" },
				{ type: "input_video", url: "https://example.com/v.mp4" },
			]),
		).toEqual({
			content: [
				{ type: "input_text", text: "hello" },
				{ type: "input_video", url: "https://example.com/v.mp4" },
			],
		});
	});

	it("splits embedding text input into newline-delimited entries", () => {
		expect(splitEmbeddingTextInput("first\n\n second \r\nthird")).toEqual([
			"first",
			"second",
			"third",
		]);
	});

	it("extracts generation urls from mixed response shapes", () => {
		const urls = extractGenerationUrls({
			url: "https://example.com/direct.png",
			data: [{ b64_json: "abc123" }, { url: "https://example.com/alt.png" }],
			output: [{ uri: "https://example.com/video.mp4" }],
		});
		expect(urls).toEqual([
			"https://example.com/direct.png",
			"data:image/png;base64,abc123",
			"https://example.com/alt.png",
			"https://example.com/video.mp4",
		]);
	});

	it("normalizes moderation result shape", () => {
		const normalized = normalizeModerationResult({
			results: [
				{
					flagged: true,
					categories: { violence: true },
					category_scores: { violence: 0.91 },
				},
			],
		});
		expect(normalized).toEqual({
			flagged: true,
			categories: { violence: true },
			categoryScores: { violence: 0.91 },
			categoryAppliedInputTypes: {},
			raw: {
				flagged: true,
				categories: { violence: true },
				category_scores: { violence: 0.91 },
			},
		});
	});

	it("extracts embedding vectors and projects to 2D", () => {
		const vectors = extractEmbeddingVectors({
			data: [
				{ embedding: [1, 0, 0] },
				{ embedding: [0, 1, 0] },
				{ embedding: [0, 0, 1] },
			],
		});
		expect(vectors).toEqual([
			[1, 0, 0],
			[0, 1, 0],
			[0, 0, 1],
		]);

		const points = projectVectorsPca2d(vectors);
		expect(points).toHaveLength(3);
		for (const point of points) {
			expect(Number.isFinite(point.x)).toBe(true);
			expect(Number.isFinite(point.y)).toBe(true);
		}
	});
});
