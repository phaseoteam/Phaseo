import { describe, expect, it } from "vitest";
import { EmbeddingsSchema } from "../schemas";

describe("embeddings schema validation", () => {
	it("accepts OpenAI token arrays", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-large",
			input: [101, 202, 303],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts batch token arrays", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-large",
			input: [
				[101, 202],
				[303, 404],
			],
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts multimodal embedding input objects", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "google/gemini-embedding-001",
			input: {
				content: [
					{ type: "input_text", text: "index this image" },
					{
						type: "input_image",
						image_url: {
							url: "https://example.com/image.jpg",
						},
					},
				],
			},
			provider_options: {
				google: {
					task_type: "RETRIEVAL_QUERY",
				},
			},
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts Perplexity embedding encoding formats", () => {
		const base64Int8 = EmbeddingsSchema.safeParse({
			model: "perplexity/pplx-embed-v1-0.6b",
			input: "hello",
			encoding_format: "base64_int8",
		});
		const base64Binary = EmbeddingsSchema.safeParse({
			model: "perplexity/pplx-embed-v1-4b",
			input: "hello",
			encoding_format: "base64_binary",
		});

		expect(base64Int8.success).toBe(true);
		expect(base64Binary.success).toBe(true);
	});

	it("rejects requests missing input", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-large",
		});
		expect(parsed.success).toBe(false);
	});

	it("rejects legacy inputs alias without input", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-large",
			inputs: "legacy alias",
		} as any);
		expect(parsed.success).toBe(false);
	});

	it("rejects bare content-part arrays without content wrapper", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "google/gemini-embedding-001",
			input: [
				{ type: "input_text", text: "hello" },
				{
					type: "input_image",
					image_url: { url: "https://example.com/image.jpg" },
				},
			],
		});
		expect(parsed.success).toBe(false);
	});
});
