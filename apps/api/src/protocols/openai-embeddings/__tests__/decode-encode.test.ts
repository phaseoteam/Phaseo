import { describe, expect, it } from "vitest";
import { decodeOpenAIEmbeddingsRequest, decodeOpenAIEmbeddingsResponse } from "../decode";
import { encodeOpenAIEmbeddingsRequest, encodeOpenAIEmbeddingsResponse } from "../encode";

describe("openai embeddings protocol adapters", () => {
	it("decodes token arrays and provider options", () => {
		const ir = decodeOpenAIEmbeddingsRequest({
			model: "openai/text-embedding-3-large",
			input: [101, 102, 103],
			dimensions: 512,
			provider_options: {
				mistral: {
					output_dtype: "float",
				},
			},
		} as any);

		expect(ir.input).toEqual([101, 102, 103]);
		expect(ir.dimensions).toBe(512);
		expect(ir.providerOptions?.mistral).toEqual({
			outputDtype: "float",
		});
	});

	it("decodes legacy embedding_options into provider options", () => {
		const ir = decodeOpenAIEmbeddingsRequest({
			model: "mistral/mistral-embed",
			input: "hello",
			embedding_options: {
				mistral: {
					output_dtype: "int8",
				},
			},
		} as any);

		expect(ir.providerOptions?.mistral).toEqual({
			outputDtype: "int8",
		});
	});

	it("decodes multimodal object inputs", () => {
		const ir = decodeOpenAIEmbeddingsRequest({
			model: "google/gemini-embedding-001",
			input: {
				content: [
					{ type: "input_text", text: "find similar products" },
					{
						type: "input_image",
						image_url: { url: "https://example.com/product.jpg" },
					},
				],
			},
		} as any);

		expect(ir.input).toEqual([
			{ type: "text", text: "find similar products" },
			{
				type: "image",
				source: "url",
				data: "https://example.com/product.jpg",
			},
		]);
	});

	it("encodes multimodal IR input back to openai-compatible parts", () => {
		const encoded = encodeOpenAIEmbeddingsRequest({
			model: "google/gemini-embedding-001",
			input: [[
				{ type: "text", text: "find similar products" },
				{
					type: "image",
					source: "url",
					data: "https://example.com/product.jpg",
				},
			]],
		} as any);

		expect(encoded.input).toEqual([[
			{ type: "input_text", text: "find similar products" },
			{
				type: "input_image",
				image_url: { url: "https://example.com/product.jpg" },
			},
		]]);
	});

	it("preserves image data-url mime type through decode+encode", () => {
		const ir = decodeOpenAIEmbeddingsRequest({
			model: "google/gemini-embedding-001",
			input: {
				content: [
					{
						type: "input_image",
						image_url: { url: "data:image/webp;base64,AAEC" },
					},
				],
			},
		} as any);
		const encoded = encodeOpenAIEmbeddingsRequest(ir);
		expect(encoded.input?.[0]?.image_url?.url).toBe("data:image/webp;base64,AAEC");
	});

	it("preserves multimodal usage details through decode+encode", () => {
		const ir = decodeOpenAIEmbeddingsResponse({
			object: "list",
			model: "google/gemini-embedding-001",
			data: [{ index: 0, embedding: [0.1, 0.2] }],
			usage: {
				input_tokens: 120,
				total_tokens: 120,
				embedding_tokens: 120,
				input_tokens_details: {
					input_images: 64,
					input_audio: 8,
				},
			},
		});
		const encoded = encodeOpenAIEmbeddingsResponse(ir);

		expect(encoded.usage).toMatchObject({
			input_tokens: 120,
			total_tokens: 120,
			embedding_tokens: 120,
			input_tokens_details: {
				input_images: 64,
				input_audio: 8,
			},
		});
	});
});
