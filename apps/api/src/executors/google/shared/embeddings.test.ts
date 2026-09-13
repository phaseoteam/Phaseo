import { describe, expect, it } from "vitest";
import { extractEmbeddingUsage, mapGoogleToIr, normalizeEmbeddingInput } from "./embeddings";

describe("Google embedding normalization", () => {
	it("does not count aggregate and per-embedding usage twice", () => {
		const usage = extractEmbeddingUsage({
			usageMetadata: { promptTokenCount: 8, totalTokenCount: 8 },
			embeddings: [{ usageMetadata: { promptTokenCount: 8, totalTokenCount: 8 } }],
		});
		expect(usage?.embedding_tokens).toBe(8);
	});

	it("preserves modality meters and exact totals for media-only inputs", () => {
		const payload = { embedding: { values: [0.5] }, usageMetadata: {
			promptTokenCount: 20, totalTokenCount: 20,
			promptTokensDetails: [{ modality: "AUDIO", tokenCount: 20 }],
		} };
		expect(extractEmbeddingUsage(payload)).toMatchObject({ input_text_tokens: 0, input_audio_tokens: 20, embedding_tokens: 20 });
		expect(mapGoogleToIr(payload, "model").usage).toMatchObject({ inputTokens: 20, totalTokens: 20, _ext: { inputAudioTokens: 20 } });
	});

	it("rejects token IDs instead of embedding their decimal representation", async () => {
		await expect(normalizeEmbeddingInput([123, 456])).rejects.toThrow("token ID arrays");
	});
});
