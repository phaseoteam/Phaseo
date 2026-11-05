import { describe, expect, it } from "vitest";
import { RerankSchema } from "@core/schemas";
import { decodeOpenAIRerankRequest, decodeOpenAIRerankResponse } from "./decode";
import { encodeOpenAIRerankResponse } from "./encode";

describe("Cohere v2 rerank protocol fields", () => {
	it("carries max_tokens_per_doc and priority from the public schema through IR", () => {
		const request = RerankSchema.parse({
			model: "cohere/rerank-v4.0-pro",
			query: "capital of the United States",
			documents: ["Washington, D.C.", "Carson City"],
			top_n: 1,
			max_tokens_per_doc: 4096,
			priority: 999,
		});

		const ir = decodeOpenAIRerankRequest(request);
		expect(ir.maxTokensPerDoc).toBe(4096);
		expect(ir.priority).toBe(999);
	});

	it("normalizes and publicly exposes Cohere billed search units", () => {
		const ir = decodeOpenAIRerankResponse({
			id: "rerank-id",
			results: [{ index: 0, relevance_score: 0.99 }],
			meta: { billed_units: { search_units: 1 } },
		}, "cohere/rerank-v4.0-pro");

		expect(ir.usage?.searchUnits).toBe(1);
		expect(encodeOpenAIRerankResponse(ir).usage.search_units).toBe(1);
	});

	it("reads Rerank v5 billed input tokens", () => {
		const ir = decodeOpenAIRerankResponse({
			id: "rerank-v5",
			results: [{ index: 2, relevance_score: 0.84 }],
			meta: { billed_units: { input_tokens: 192 } },
		}, "cohere/rerank-v5.0-pro");

		expect(ir.usage?.inputTokens).toBe(192);
		expect(ir.usage?.searchUnits).toBeUndefined();
		expect(encodeOpenAIRerankResponse(ir).usage.input_tokens).toBe(192);
	});

	it("treats null search units on a token-billed response as absent", () => {
		const ir = decodeOpenAIRerankResponse({
			id: "rerank-v5-null",
			results: [{ index: 0, relevance_score: 0.5 }],
			meta: { billed_units: { input_tokens: 50, search_units: null } },
		}, "cohere/rerank-v5.0-fast");

		expect(ir.usage?.inputTokens).toBe(50);
		expect(ir.usage?.searchUnits).toBeUndefined();
	});
});
