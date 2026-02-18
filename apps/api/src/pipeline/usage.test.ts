import { describe, expect, it } from "vitest";
import { shapeUsageForClient } from "./usage";

describe("shapeUsageForClient", () => {
	it("preserves multimodal token details and exposes top-level token meters", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 66,
			output_tokens: 1536,
			total_tokens: 2027,
			input_tokens_details: {
				input_images: 12,
			},
			output_tokens_details: {
				reasoning_tokens: 425,
				output_images: 1120,
			},
		});

		expect(shaped.input_tokens_details.input_images).toBe(12);
		expect(shaped.output_tokens_details.reasoning_tokens).toBe(425);
		expect(shaped.output_tokens_details.output_images).toBe(1120);
		expect(shaped.input_image_tokens).toBe(12);
		expect(shaped.output_image_tokens).toBe(1120);
	});

	it("falls back to count-based image details when token details are unavailable", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 10,
			output_tokens: 20,
			total_tokens: 30,
			input_image_count: 2,
			output_image_count: 1,
		});

		expect(shaped.input_tokens_details.input_images).toBe(2);
		expect(shaped.output_tokens_details.output_images).toBe(1);
		expect(shaped.input_image_tokens).toBeUndefined();
		expect(shaped.output_image_tokens).toBeUndefined();
	});

	it("derives canonical token split when only total_tokens is provided", () => {
		const shaped = shapeUsageForClient({
			total_tokens: 12,
		});

		expect(shaped.input_tokens).toBe(12);
		expect(shaped.output_tokens).toBe(0);
		expect(shaped.total_tokens).toBe(12);
		expect(shaped.input_text_tokens).toBe(12);
		expect(shaped.output_text_tokens).toBe(0);
		expect(shaped.requests).toBe(1);
	});

	it("preserves explicit request meter when provider reports one", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 2,
			output_tokens: 3,
			total_tokens: 5,
			request_count: 7,
		});

		expect(shaped.requests).toBe(7);
	});

	it("maps Anthropic cache usage fields to gateway cache meters", () => {
		const shaped = shapeUsageForClient({
			input_tokens: 100,
			output_tokens: 20,
			total_tokens: 120,
			cache_read_input_tokens: 45,
			cache_creation_input_tokens: 12,
		});

		expect(shaped.cached_read_text_tokens).toBe(45);
		expect(shaped.cached_write_text_tokens).toBe(12);
		expect(shaped.input_tokens_details.cached_tokens).toBe(45);
		expect(shaped.output_tokens_details.cached_tokens).toBe(12);
	});
});
