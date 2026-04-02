import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IREmbeddingsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";
import { executor } from "./index";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";

function buildArgs({
	providerId = "openai",
	providerModelSlug = null,
	ir,
}: {
	providerId?: string;
	providerModelSlug?: string | null;
	ir?: Partial<IREmbeddingsRequest>;
} = {}): ExecutorExecuteArgs {
	const request: IREmbeddingsRequest = {
		model: "openai/text-embedding-3-small",
		input: "hello world",
		...ir,
	};

	return {
		ir: request,
		requestId: "req_openai_embeddings_test",
		teamId: "team_test",
		providerId,
		endpoint: "embeddings",
		protocol: "openai.embeddings",
		capability: "embeddings",
		providerModelSlug,
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

describe("openai embeddings executor", () => {
	it("preserves slash-delimited provider model slugs for OpenAI-compatible providers", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.novita.example/openai/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "baai/bge-m3",
					data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
					usage: { prompt_tokens: 6, total_tokens: 6 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "novita",
			providerModelSlug: "baai/bge-m3",
			ir: { model: "openai/text-embedding-3-small" },
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("baai/bge-m3");
	});

	it("strips gateway prefixes from canonical model ids when provider model slug is absent", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.openai.com/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "text-embedding-3-small",
					data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
					usage: { prompt_tokens: 4, total_tokens: 4 },
				}),
			},
		]);

		const result = await executor(buildArgs());
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("text-embedding-3-small");
	});

	it("maps mistral dimensions and dtype to provider-specific fields", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.mistral.example/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "mistral-embed",
					data: [{ object: "embedding", index: 0, embedding: [0.3, 0.4] }],
					usage: { prompt_tokens: 8, total_tokens: 8 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "mistral",
			ir: {
				model: "mistral/mistral-embed",
				dimensions: 512,
				providerOptions: {
					mistral: {
						outputDtype: "int8",
					},
				},
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("mistral-embed");
		expect(mock.calls[0]?.bodyJson?.output_dimension).toBe(512);
		expect(mock.calls[0]?.bodyJson?.output_dtype).toBe("int8");
		expect(mock.calls[0]?.bodyJson?.dimensions).toBeUndefined();
	});

	it("strips unsupported dimensions and user fields for cohere embeddings compatibility endpoint", async () => {
		setupRuntimeFromEnv({
			COHERE_API_KEY: "test-cohere-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.cohere.example/compatibility/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "embed-v4.0",
					data: [{ object: "embedding", index: 0, embedding: [0.11, 0.22] }],
					usage: { prompt_tokens: 12, total_tokens: 12 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "cohere",
			ir: {
				model: "cohere/embed-v4.0",
				dimensions: 512,
				userId: "user_cohere_test",
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("embed-v4.0");
		expect(mock.calls[0]?.bodyJson?.dimensions).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.user).toBeUndefined();
	});

	it("maps dimensions to output_dimension for voyage embeddings", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "voyage-4",
					data: [{ object: "embedding", index: 0, embedding: [0.31, 0.42] }],
					usage: { prompt_tokens: 9, total_tokens: 9 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-4",
				dimensions: 1024,
				userId: "user_voyage_test",
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("voyage-4");
		expect(mock.calls[0]?.bodyJson?.output_dimension).toBe(1024);
		expect(mock.calls[0]?.bodyJson?.dimensions).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.user).toBeUndefined();
	});
});
