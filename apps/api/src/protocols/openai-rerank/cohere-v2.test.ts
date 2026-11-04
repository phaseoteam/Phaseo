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

	it("keeps top-level relevant_spans as a Cohere provider option", () => {
		const request = RerankSchema.parse({
			model: "cohere/rerank-v5.0-pro",
			query: "capital of the United States",
			documents: ["Washington, D.C.", "Carson City"],
			relevant_spans: { mode: "enabled", threshold: 0.2 },
			provider_options: { cohere: { other: true } },
		});
		const ir = decodeOpenAIRerankRequest(request);
		expect(ir.vendor?.provider_options?.cohere).toEqual({ other: true, relevant_spans: { mode: "enabled", threshold: 0.2 } });
	});

	it("reads Rerank v5 billed input tokens and exposes relevant spans", () => {
		const ir = decodeOpenAIRerankResponse({
			id: "rerank-v5",
			results: [{ index: 2, relevance_score: 0.84, relevant_spans: [{ start: 0, end: 139, score: 0.9997 }] }],
			meta: { billed_units: { input_tokens: 192 } },
		}, "cohere/rerank-v5.0-pro");

		expect(ir.usage?.inputTokens).toBe(192);
		expect(ir.usage?.searchUnits).toBeUndefined();
		const encoded = encodeOpenAIRerankResponse(ir);
		expect(encoded.usage.input_tokens).toBe(192);
		expect(encoded.results[0].relevant_spans).toEqual([{ start: 0, end: 139, score: 0.9997 }]);
	});
});
