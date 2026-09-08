import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IREmbeddingsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeOpenAIEmbeddingsRequest } from "@protocols/openai-embeddings/decode";
import { executor } from "@executors/openai/embeddings";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function args(ir: Partial<IREmbeddingsRequest> = {}): ExecutorExecuteArgs {
	return {
		ir: {
			model: "baai/bge-m3",
			input: ["first", "second"],
			encodingFormat: "float",
			userId: "user-123",
			providerOptions: { morpheus: { sessionId: "session-123" } },
			...ir,
		},
		requestId: "req_morpheus_embeddings",
		workspaceId: "team_test",
		providerId: "morpheus",
		endpoint: "embeddings",
		protocol: "openai.embeddings",
		capability: "embeddings",
		providerModelSlug: "text-embedding-bge-m3",
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] },
		meta: { returnUpstreamRequest: true },
	} as ExecutorExecuteArgs;
}

beforeAll(() => setupRuntimeFromEnv({ MORPHEUS_API_KEY: "morpheus-test-key" } as any));
afterAll(() => teardownTestRuntime());

describe("Morpheus current embeddings contract", () => {
	it("rejects dimensions before making a provider request", async () => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(args({ dimensions: 1024 }));
			expect(result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});
	it("preserves the documented session extension through public decode", () => {
		const ir = decodeOpenAIEmbeddingsRequest({
			model: "text-embedding-bge-m3",
			input: "hello",
			session_id: "session-123",
		} as any);
		expect(ir.providerOptions?.morpheus).toEqual({ sessionId: "session-123" });
	});

	it("uses the versioned endpoint and exact text embedding request/response shape", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.mor.org/api/v1/embeddings",
			response: jsonResponse({
				object: "list",
				model: "text-embedding-bge-m3",
				data: [
					{ object: "embedding", index: 0, embedding: [0.1, 0.2] },
					{ object: "embedding", index: 1, embedding: [0.3, 0.4] },
				],
				usage: { prompt_tokens: 7, total_tokens: 7 },
			}),
		}]);

		const result = await executor(args());
		mock.restore();

		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer morpheus-test-key");
		expect(mock.calls[0]?.bodyJson).toEqual({
			model: "text-embedding-bge-m3",
			input: ["first", "second"],
			encoding_format: "float",
			user: "user-123",
			session_id: "session-123",
		});
		expect(result.kind).toBe("completed");
		expect((result as any).ir).toMatchObject({
			model: "text-embedding-bge-m3",
			data: [{ index: 0, embedding: [0.1, 0.2] }, { index: 1, embedding: [0.3, 0.4] }],
			usage: { inputTokens: 7, totalTokens: 7 },
		});
		expect((result as any).bill.usage).toMatchObject({
			requests: 1,
			input_tokens: 7,
			input_text_tokens: 7,
			total_tokens: 7,
			embedding_tokens: 7,
			output_tokens: 0,
		});
	});

	it("preserves upstream validation and billing errors for the public error layer", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.mor.org/api/v1/embeddings",
			response: new Response(JSON.stringify({ detail: "Insufficient credits" }), {
				status: 402,
				headers: { "Content-Type": "application/json", "x-request-id": "upstream-402" },
			}),
		}]);

		const result = await executor(args({ input: "hello" }));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect((result as any).upstream.status).toBe(402);
		expect((result as any).rawResponse).toEqual({ detail: "Insufficient credits" });
		expect((result as any).bill.upstream_id).toBe("upstream-402");
	});
});
