import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IREmbeddingsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs(overrides?: Partial<IREmbeddingsRequest>): ExecutorExecuteArgs {
	const ir: IREmbeddingsRequest = {
		model: "google/gemini-embedding-001",
		input: "hello world",
		...overrides,
	};
	return {
		ir,
		requestId: "req_google_embed_test",
		teamId: "team_test",
		providerId: "google-ai-studio",
		endpoint: "embeddings",
		protocol: "openai.embeddings",
		capability: "embeddings",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {
			returnUpstreamRequest: true,
			debug: {
				return_upstream_request: true,
			},
		},
	} as ExecutorExecuteArgs;
}

beforeAll(() => {
	setupTestRuntime();
});

afterAll(() => {
	teardownTestRuntime();
});

describe("google-ai-studio embeddings executor", () => {
	it("maps multimodal embedding input into Gemini content.parts", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":embedContent"),
				response: jsonResponse({
					embedding: {
						values: [0.1, 0.2, 0.3],
					},
					usageMetadata: {
						promptTokenCount: 12,
						totalTokenCount: 12,
					},
				}),
			},
		]);

		const result = await executor(buildArgs({
			input: [
				{ type: "text", text: "caption this image" },
				{
					type: "image",
					source: "data",
					mimeType: "image/png",
					data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
				},
			],
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toContain("/models/gemini-embedding-001:embedContent");
		expect(mock.calls[0]?.bodyJson?.content?.parts).toEqual([
			{ text: "caption this image" },
			{
				inline_data: {
					mime_type: "image/png",
					data: "iVBORw0KGgoAAAANSUhEUgAAAAUA",
				},
			},
		]);
	});

	it("routes batch embeddings with multimodal entries through batchEmbedContents", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url.includes(":batchEmbedContents"),
				response: jsonResponse({
					embeddings: [
						{ values: [0.1, 0.2] },
						{ values: [0.3, 0.4] },
					],
					usageMetadata: {
						promptTokenCount: 20,
						totalTokenCount: 20,
					},
				}),
			},
		]);

		const result = await executor(buildArgs({
			input: [
				"hello",
				[
					{ type: "text", text: "catalog product image" },
					{
						type: "image",
						source: "data",
						mimeType: "image/png",
						data: "AAABBBCCC",
					},
				],
			],
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.url).toContain(":batchEmbedContents");
		expect(mock.calls[0]?.bodyJson?.requests).toHaveLength(2);
		expect(mock.calls[0]?.bodyJson?.requests?.[0]?.content?.parts).toEqual([{ text: "hello" }]);
		expect(mock.calls[0]?.bodyJson?.requests?.[1]?.content?.parts?.[0]).toEqual({
			text: "catalog product image",
		});
		expect(mock.calls[0]?.bodyJson?.requests?.[1]?.content?.parts?.[1]).toEqual({
			inline_data: {
				mime_type: "image/png",
				data: "AAABBBCCC",
			},
		});
	});
});
