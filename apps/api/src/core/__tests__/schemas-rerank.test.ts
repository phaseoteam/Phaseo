import { describe, expect, it } from "vitest";
import { RerankSchema } from "../schemas";

describe("rerank schema validation", () => {
	it("accepts standard rerank payloads", () => {
		const parsed = RerankSchema.safeParse({
			model: "cohere/rerank-v4.0-fast",
			query: "best way to cache in next.js",
			documents: ["doc 1", "doc 2"],
			top_n: 2,
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts object documents and top_k alias", () => {
		const parsed = RerankSchema.safeParse({
			model: "qwen/qwen3-reranker-8b",
			query: "vector db choices",
			documents: [
				{ id: "a", text: "faiss overview" },
				{ id: "b", text: "pgvector setup" },
			],
			top_k: 1,
			return_documents: true,
		});

		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.top_n).toBe(1);
		}
	});

	it("rejects missing query or documents", () => {
		const parsed = RerankSchema.safeParse({
			model: "cohere/rerank-v4.0-fast",
		});
		expect(parsed.success).toBe(false);
	});
});
