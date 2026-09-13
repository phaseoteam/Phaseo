import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function args(input: unknown = "hello", overrides: Record<string, unknown> = {}): ExecutorExecuteArgs {
	return {
		ir: { model: "google/gemini-embedding-2", input, ...overrides },
		requestId: "vertex-embedding-test", workspaceId: "test", providerId: "google-vertex",
		endpoint: "embeddings", byokMeta: [], pricingCard: { rules: [] },
		meta: { returnUpstreamRequest: true },
	};
}

beforeEach(() => setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_ACCESS_TOKEN: "test-token" } as any));
afterEach(teardownTestRuntime);

describe("Vertex Gemini embeddings", () => {
	it("uses Vertex auth and native config while preserving multimodal usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://aiplatform.googleapis.com/v1/projects/test-project/locations/global/publishers/google/models/gemini-embedding-2:embedContent",
			response: jsonResponse({ embedding: { values: [0.5, 1] }, usageMetadata: {
				promptTokenCount: 12, totalTokenCount: 12,
				promptTokensDetails: [{ modality: "TEXT", tokenCount: 2 }, { modality: "IMAGE", tokenCount: 10 }],
			} }),
		}]);
		try {
			const result = await executor(args([
				{ type: "text", text: "caption" }, { type: "image", source: "data", data: "aGVsbG8=", mimeType: "image/png" },
			], { dimensions: 2, encodingFormat: "base64" }));
			expect(mock.calls[0].headers.Authorization).toBe("Bearer test-token");
			expect(mock.calls[0].bodyJson).toMatchObject({
				content: { parts: [{ text: "caption" }, { inline_data: { mime_type: "image/png", data: "aGVsbG8=" } }] },
				embedContentConfig: { outputDimensionality: 2 },
			});
			expect(result.kind).toBe("completed");
			if (result.kind !== "completed") throw new Error("Expected completed result");
			expect((result.ir as any).data).toEqual([{ index: 0, embedding: "AAAAPwAAgD8=" }]);
			expect(result.bill.usage).toMatchObject({ input_text_tokens: 2, input_image_tokens: 10, embedding_tokens: 12 });
			expect((result.ir as any).usage.inputTokens).toBe(12);
		} finally { mock.restore(); }
	});

	it.each([{ input: ["one", "two"] }, { input: [1, 2, 3] }])("rejects unsupported input before any upstream call: $input", async ({ input }) => {
		const mock = installFetchMock([]);
		try {
			const result = await executor(args(input));
			expect(result.kind === "completed" && result.upstream.status).toBe(400);
			expect(mock.calls).toHaveLength(0);
		} finally { mock.restore(); }
	});

	it("preserves upstream errors without producing embeddings or token-count requests", async () => {
		const mock = installFetchMock([{ match: () => true, response: jsonResponse({ error: { message: "quota" } }, { status: 429 }) }]);
		try {
			const result = await executor(args());
			expect(result.kind === "completed" && result.upstream.status).toBe(429);
			if (result.kind !== "completed") throw new Error("Expected completed result");
			expect(result.ir).toBeUndefined();
			expect(result.bill.usage).toBeUndefined();
			expect(mock.calls).toHaveLength(1);
		} finally { mock.restore(); }
	});
});
