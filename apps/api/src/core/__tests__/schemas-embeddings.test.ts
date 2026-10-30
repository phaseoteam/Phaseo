import { describe, expect, it } from "vitest";
import { EmbeddingsSchema } from "../schemas";

describe("embeddings schema validation", () => {
	it("accepts documented Mistral request extensions", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "mistral/mistral-embed",
			input: ["one", "two"],
			encoding_format: "base64",
			dimensions: 256,
			metadata: { tenant: "eu-customer", trace: 42 },
			provider_options: { mistral: { output_dtype: "int8" } },
		});

		expect(parsed.success).toBe(true);
		if (parsed.success) expect(parsed.data.metadata).toEqual({ tenant: "eu-customer", trace: 42 });
	});
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

	it("rejects empty text inputs and arrays above OpenAI's 2048-item limit", () => {
		expect(EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-small",
			input: "",
		}).success).toBe(false);
		expect(EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-small",
			input: Array.from({ length: 2049 }, (_, index) => index),
		}).success).toBe(false);
		expect(EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-small",
			input: Array.from({ length: 2049 }, (_, index) => `input-${index}`),
		}).success).toBe(false);
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
	it.each([
		["a nested object", { text: { nested: true } }],
		["an object holding an array", { text: ["one", "two"] }],
		["an array of objects with nested values", [{ text: { value: "hello" } }, { text: "world" }]],
		["an array of empty objects", [{}]],
	])("rejects %s as embedding input", (_label, input) => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-small",
			input,
		});
		expect(parsed.success).toBe(false);
	});

	it("names the offending field for nested structured input", () => {
		const parsed = EmbeddingsSchema.safeParse({
			model: "openai/text-embedding-3-small",
			input: { text: { nested: true } },
		});
		expect(parsed.success).toBe(false);
		if (parsed.success) return;
		expect(JSON.stringify(parsed.error.issues)).toContain("structured embedding input fields must be strings, numbers or booleans");
	});

	it("keeps flat template-field objects for prompt-template providers", () => {
		expect(EmbeddingsSchema.safeParse({
			model: "fireworks/qwen3-embedding-8b",
			input: [{ text: "hello" }, { text: "world", title: "Doc", rank: 2, draft: false }],
			provider_options: { fireworks: { prompt_template: "Embed this text: {text}" } },
		}).success).toBe(true);
		expect(EmbeddingsSchema.safeParse({
			model: "fireworks/qwen3-embedding-8b",
			input: { text: "hello" },
		}).success).toBe(true);
	});

	it("keeps multimodal content objects inside a batch", () => {
		expect(EmbeddingsSchema.safeParse({
			model: "voyage/voyage-multimodal-3",
			input: [
				{ content: [{ type: "input_text", text: "a" }] },
				{ content: [{ type: "input_image", image_url: "https://example.com/a.png" }] },
			],
		}).success).toBe(true);
	});
});
