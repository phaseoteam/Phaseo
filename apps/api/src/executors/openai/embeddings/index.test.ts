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
		workspaceId: "team_test",
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
	it.each(["alibaba-cloud", "alibaba", "qwen"])("implements Alibaba text embeddings for alias %s", async (providerId) => {
		setupRuntimeFromEnv({
			DASHSCOPE_API_KEY: "test-dashscope-key",
			ALIBABA_BASE_URL: "https://workspace.ap-southeast-1.maas.aliyuncs.com",
		} as any);
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/compatible-mode/v1/embeddings"),
			response: jsonResponse({
				object: "list",
				model: "text-embedding-v4",
				data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
				usage: { prompt_tokens: 4, total_tokens: 4 },
			}),
		}]);
		await executor(buildArgs({
			providerId,
			providerModelSlug: "text-embedding-v4",
			ir: { input: ["hello"], dimensions: 256 },
		}));
		expect(mock.calls[0]?.bodyJson).toMatchObject({
			model: "text-embedding-v4",
			input: ["hello"],
			dimensions: 256,
		});
		mock.restore();
	});

	it("uses Together's native model/input-only embeddings contract", async () => {
		setupRuntimeFromEnv({ TOGETHER_API_KEY: "test-together-key" } as any);
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/embeddings"),
			response: jsonResponse({
				object: "list",
				model: "BAAI/bge-large-en-v1.5",
				data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
			}),
		}]);
		const result = await executor(buildArgs({
			providerId: "together",
			providerModelSlug: "BAAI/bge-large-en-v1.5",
			ir: {
				model: "baai/bge-large-en-v1.5",
				input: ["hello", "world"],
				dimensions: 512,
				encodingFormat: "base64",
				userId: "not-supported",
			},
		}));
		mock.restore();

		expect(mock.calls[0]?.bodyJson).toEqual({
			model: "BAAI/bge-large-en-v1.5",
			input: ["hello", "world"],
		});
		expect(result.kind).toBe("completed");
	});

	it("implements Perplexity standard embeddings with native quantized encoding and usage cost", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.perplexity.example/v1/embeddings",
			response: jsonResponse({
				object: "list",
				model: "pplx-embed-v1-0.6b",
				data: [{ object: "embedding", index: 0, embedding: "AAEC/w==" }],
				usage: {
					prompt_tokens: 6,
					total_tokens: 6,
					cost: { input_cost: 0.000000024, total_cost: 0.000000024, currency: "USD" },
				},
			}),
		}]);
		const result = await executor(buildArgs({
			providerId: "perplexity",
			providerModelSlug: "pplx-embed-v1-0.6b",
			ir: {
				model: "perplexity/pplx-embed-v1-0.6b",
				input: ["hello", "world"],
				dimensions: 512,
				userId: "not-supported",
			},
		}));
		mock.restore();

		expect(mock.calls[0]?.bodyJson).toEqual({
			model: "pplx-embed-v1-0.6b",
			input: ["hello", "world"],
			encoding_format: "base64_int8",
			dimensions: 512,
		});
		expect((result as any).ir).toMatchObject({
			model: "pplx-embed-v1-0.6b",
			data: [{ index: 0, embedding: "AAEC/w==" }],
			usage: {
				inputTokens: 6,
				totalTokens: 6,
				_ext: { providerCost: { total_cost: 0.000000024, currency: "USD" } },
			},
		});
		expect((result as any).bill.usage).toMatchObject({ input_text_tokens: 6, embedding_tokens: 6 });
	});

	it("rejects contextualized models until the nested native schema can be represented losslessly", async () => {
		await expect(executor(buildArgs({
			providerId: "perplexity",
			providerModelSlug: "pplx-embed-context-v1-0.6b",
			ir: { input: ["chunk one", "chunk two"] },
		}))).rejects.toThrow("perplexity_contextualized_embeddings_require_native_schema");
	});

	it("enforces Perplexity's text-only input, encoding, and model-specific dimension contract", async () => {
		await expect(executor(buildArgs({
			providerId: "perplexity",
			providerModelSlug: "pplx-embed-v1-0.6b",
			ir: { input: [1, 2, 3] },
		}))).rejects.toThrow("perplexity_embeddings_text_input_required");
		await expect(executor(buildArgs({
			providerId: "perplexity",
			providerModelSlug: "pplx-embed-v1-0.6b",
			ir: { encodingFormat: "float" },
		}))).rejects.toThrow("perplexity_embeddings_encoding_format_unsupported");
		await expect(executor(buildArgs({
			providerId: "perplexity",
			providerModelSlug: "pplx-embed-v1-0.6b",
			ir: { dimensions: 1025 },
		}))).rejects.toThrow("perplexity_embeddings_dimensions_out_of_range");
	});

	it("rejects Morpheus dimension overrides before sending an upstream request", async () => {
		const mock = installFetchMock([]);
		const result = await executor(buildArgs({
			providerId: "morpheus",
			providerModelSlug: "morpheus-embedding-v1",
			ir: {
				model: "morpheus/morpheus-embedding-v1",
				dimensions: 256,
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({
			error: {
				code: "unsupported_parameter",
				param: "dimensions",
			},
		});
		expect(mock.calls).toHaveLength(0);
	});

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

	it.each(["novita", "novitaai"])("implements Novita embeddings for alias %s", async (providerId) => {
		setupRuntimeFromEnv({
			NOVITA_API_KEY: "novita-test",
			NOVITA_BASE_URL: "https://api.novita.ai",
		} as any);
		const mock = installFetchMock([{
			match: (url) => url === "https://api.novita.example/openai/v1/embeddings",
			response: jsonResponse({
				object: "list",
				model: "baai/bge-m3",
				data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
				usage: { prompt_tokens: 6, total_tokens: 6 },
			}),
		}]);
		const result = await executor(buildArgs({
			providerId,
			providerModelSlug: "baai/bge-m3",
			ir: {
				model: "baai/bge-m3",
				input: ["hello", "world"],
				encodingFormat: "float",
				dimensions: 512,
				userId: "not-supported",
			},
		}));
		expect(mock.calls[0]?.headers.Authorization).toBe("Bearer test-novita-key");
		expect(mock.calls[0]?.bodyJson).toEqual({
			model: "baai/bge-m3",
			input: ["hello", "world"],
			encoding_format: "float",
		});
		expect((result as any).ir).toMatchObject({
			model: "baai/bge-m3",
			data: [{ index: 0, embedding: [0.1, 0.2] }],
			usage: { inputTokens: 6, totalTokens: 6 },
		});
		expect((result as any).bill.usage).toMatchObject({ input_text_tokens: 6, embedding_tokens: 6 });
		mock.restore();
	});

	it("implements the Nebius embeddings contract and preserves service tier", async () => {
		setupRuntimeFromEnv({ NEBIUS_API_KEY: "test-nebius-key" } as any);
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/embeddings"),
			response: jsonResponse({
				object: "list",
				model: "Qwen/Qwen3-Embedding-8B",
				data: [{ object: "embedding", index: 0, embedding: "AACAPwAAAMA=" }],
				usage: { prompt_tokens: 8, total_tokens: 8 },
				service_tier: "flex",
			}),
		}]);
		const result = await executor(buildArgs({
			providerId: "nebius-token-factory",
			providerModelSlug: "Qwen/Qwen3-Embedding-8B",
			ir: {
				model: "qwen/qwen3-embedding-8b",
				input: [[101, 102], [103]],
				dimensions: 1024,
				encodingFormat: "base64",
				userId: "customer-1",
				serviceTier: "flex",
			},
		}));
		mock.restore();

		expect(mock.calls[0]?.bodyJson).toMatchObject({
			model: "Qwen/Qwen3-Embedding-8B",
			input: [[101, 102], [103]],
			dimensions: 1024,
			encoding_format: "base64",
			user: "customer-1",
			service_tier: "flex",
		});
		expect((result as any).ir).toMatchObject({
			model: "Qwen/Qwen3-Embedding-8B",
			data: [{ index: 0, embedding: "AACAPwAAAMA=" }],
			serviceTier: "flex",
			usage: { inputTokens: 8, totalTokens: 8 },
		});
	});

	it("preserves Nebius validation errors without fabricating an embeddings IR", async () => {
		setupRuntimeFromEnv({ NEBIUS_API_KEY: "test-nebius-key" } as any);
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/embeddings"),
			response: jsonResponse({ detail: [{ loc: ["body", "dimensions"], msg: "invalid", type: "value_error" }] }, { status: 422 }),
		}]);
		const result = await executor(buildArgs({
			providerId: "nebius-token-factory",
			providerModelSlug: "Qwen/Qwen3-Embedding-8B",
			ir: { model: "qwen/qwen3-embedding-8b", dimensions: 999999 },
		}));
		mock.restore();
		expect(result.kind).toBe("completed");
		expect((result as any).upstream.status).toBe(422);
		expect((result as any).ir).toBeUndefined();
		expect((result as any).bill.usage).toBeUndefined();
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

	it("forwards every OpenAI embedding option and preserves base64 responses", async () => {
		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.openai.com/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "text-embedding-3-large",
					data: [{ object: "embedding", index: 0, embedding: "AACAPwAAAMA=" }],
					usage: { prompt_tokens: 3, total_tokens: 3 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			ir: {
				model: "openai/text-embedding-3-large",
				input: [[101, 102, 103]],
				dimensions: 256,
				encodingFormat: "base64",
				userId: "end-user-123",
			},
		}));
		mock.restore();

		expect(mock.calls[0]?.bodyJson).toMatchObject({
			model: "text-embedding-3-large",
			input: [[101, 102, 103]],
			dimensions: 256,
			encoding_format: "base64",
			user: "end-user-123",
		});
		expect((result as any).ir?.data).toEqual([
			{ index: 0, embedding: "AACAPwAAAMA=" },
		]);
		expect((result as any).bill?.usage).toMatchObject({
			input_tokens: 3,
			total_tokens: 3,
		});
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

	it("uses the EU regional endpoint and preserves Mistral metadata", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.eu.mistral.ai/v1/embeddings",
			response: jsonResponse({
				object: "list",
				model: "mistral-embed",
				data: [{ object: "embedding", index: 0, embedding: [0.3, 0.4] }],
				usage: { prompt_tokens: 8, completion_tokens: 0, total_tokens: 8 },
			}),
		}]);

		const result = await executor(buildArgs({
			providerId: "mistral-eu",
			providerModelSlug: "mistral-embed",
			ir: {
				model: "mistral/mistral-embed",
				dimensions: 256,
				metadata: { tenant: "eu-customer" },
				providerOptions: { mistral: { outputDtype: "uint8" } },
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls[0]?.bodyJson).toMatchObject({
			model: "mistral-embed",
			output_dimension: 256,
			output_dtype: "uint8",
			metadata: { tenant: "eu-customer" },
		});
		expect((result as any).bill?.usage).toMatchObject({
			input_tokens: 8,
			embedding_tokens: 8,
			total_tokens: 8,
		});
	});

	it("maps Fireworks embedding extensions and usage", async () => {
		const mock = installFetchMock([{
			match: (url) => url === "https://api.fireworks.example/inference/v1/embeddings",
			response: jsonResponse({
				object: "list",
				model: "fireworks/qwen3-embedding-8b",
				data: [{ object: "embedding", index: 0, embedding: [0.1, 0.2] }],
				usage: { prompt_tokens: 7, total_tokens: 7 },
			}),
		}]);

		const result = await executor(buildArgs({
			providerId: "fireworks",
			providerModelSlug: "fireworks/qwen3-embedding-8b",
			ir: {
				model: "fireworks/qwen3-embedding-8b",
				input: [{ text: "hello" }],
				dimensions: 256,
				providerOptions: {
					fireworks: {
						promptTemplate: "Embed this text: {text}",
						returnLogits: [0, 1],
						normalize: true,
					},
				},
			},
		}));
		mock.restore();

		expect(mock.calls[0]?.bodyJson).toMatchObject({
			model: "fireworks/qwen3-embedding-8b",
			input: [{ text: "hello" }],
			dimensions: 256,
			prompt_template: "Embed this text: {text}",
			return_logits: [0, 1],
			normalize: true,
		});
		expect((result as any).ir.usage).toMatchObject({ inputTokens: 7, totalTokens: 7 });
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
				encodingFormat: "base64",
				dimensions: 512,
				userId: "user_cohere_test",
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("embed-v4.0");
		expect(mock.calls[0]?.bodyJson?.encoding_format).toBe("base64");
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

	it("maps voyage embedding provider options to native fields", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "voyage-4",
					data: [{ object: "embedding", index: 0, embedding: [0.51, 0.62] }],
					usage: { prompt_tokens: 11, total_tokens: 11 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-4",
				providerOptions: {
					voyage: {
						inputType: "query",
						truncation: false,
						outputDtype: "float",
						outputDimension: 512,
					},
				},
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("voyage-4");
		expect(mock.calls[0]?.bodyJson?.input_type).toBe("query");
		expect(mock.calls[0]?.bodyJson?.truncation).toBe(false);
		expect(mock.calls[0]?.bodyJson?.output_dtype).toBe("float");
		expect(mock.calls[0]?.bodyJson?.output_dimension).toBe(512);
		expect(mock.calls[0]?.bodyJson?.provider_options).toBeUndefined();
	});

	it("routes one-document Voyage contextual embeddings and flattens its native result", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/contextualizedembeddings",
				response: jsonResponse({
					model: "voyage-context-3",
					data: [{
						index: 0,
						data: [
							{ index: 0, embedding: [0.11, 0.22], text: "First chunk" },
							{ index: 1, embedding: [0.33, 0.44], text: "Second chunk" },
						],
					}],
					usage: { total_tokens: 8 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-context-3",
				input: ["First chunk", "Second chunk"],
				encodingFormat: "float",
				dimensions: 512,
				providerOptions: {
					voyage: {
						inputType: "document",
						outputDtype: "int8",
					},
				},
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson).toMatchObject({
			model: "voyage-context-3",
			inputs: [["First chunk", "Second chunk"]],
			input_type: "document",
			output_dimension: 512,
			output_dtype: "int8",
		});
		expect(mock.calls[0]?.bodyJson?.input).toBeUndefined();
		expect(mock.calls[0]?.bodyJson?.encoding_format).toBeUndefined();
		expect((result as any).ir?.data).toEqual([
			{ index: 0, embedding: [0.11, 0.22] },
			{ index: 1, embedding: [0.33, 0.44] },
		]);
		expect((result as any).bill?.usage?.total_tokens).toBe(8);
	});

	it("keeps Voyage contextual queries independent and reindexes the flattened response", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([{
			match: (url) => url === "https://api.voyage.example/v1/contextualizedembeddings",
			response: jsonResponse({
				model: "voyage-context-3",
				data: [
					{ index: 0, data: [{ index: 0, embedding: [0.11, 0.22], text: "First query" }] },
					{ index: 1, data: [{ index: 0, embedding: [0.33, 0.44], text: "Second query" }] },
				],
				usage: { total_tokens: 6 },
			}),
		}]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-context-3",
				input: ["First query", "Second query"],
				providerOptions: { voyage: { inputType: "query" } },
			},
		}));
		mock.restore();

		expect(mock.calls[0]?.bodyJson).toMatchObject({
			inputs: [["First query"], ["Second query"]],
			input_type: "query",
		});
		expect((result as any).ir?.data).toEqual([
			{ index: 0, embedding: [0.11, 0.22] },
			{ index: 1, embedding: [0.33, 0.44] },
		]);
	});

	it("rejects Voyage contextual shapes that cannot preserve document grouping", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		await expect(executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-context-3",
				input: [["document one"], ["document two"]] as any,
			},
		}))).rejects.toThrow("voyage_contextualized_embeddings_require_one_text_document");

		await expect(executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-context-3",
				providerOptions: { voyage: { truncation: false } },
			},
		}))).rejects.toThrow("voyage_contextualized_embeddings_truncation_unsupported");
	});

	it("falls back to total_tokens when embeddings usage omits input tokens", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/embeddings",
				response: jsonResponse({
					object: "list",
					model: "voyage-3",
					data: [{ object: "embedding", index: 0, embedding: [0.31, 0.42] }],
					usage: { total_tokens: 8 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-3",
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect((result as any).bill?.usage?.input_tokens).toBe(8);
		expect((result as any).bill?.usage?.input_text_tokens).toBe(8);
		expect((result as any).bill?.usage?.total_tokens).toBe(8);
	});

	it("routes voyage multimodal embeddings to multimodal endpoint and exposes pixel usage meters", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/multimodalembeddings",
				response: jsonResponse({
					object: "list",
					model: "voyage-multimodal-3.5",
					data: [{ object: "embedding", index: 0, embedding: [0.71, 0.82] }],
					usage: {
						text_tokens: 5,
						image_pixels: 2_000_000,
						video_pixels: 35_631_232,
						total_tokens: 32_083,
					},
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-multimodal-3.5",
				input: [[
					{ type: "text", text: "This is a banana." } as any,
					{ type: "image", source: "url", data: "https://example.com/banana.jpg" } as any,
					{ type: "video", source: "url", url: "https://example.com/banana.mp4" } as any,
				]],
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.model).toBe("voyage-multimodal-3.5");
		expect(mock.calls[0]?.bodyJson?.inputs?.[0]?.content).toEqual([
			{ type: "text", text: "This is a banana." },
			{ type: "image_url", image_url: "https://example.com/banana.jpg" },
			{ type: "video_url", video_url: "https://example.com/banana.mp4" },
		]);
		expect((result as any).bill?.usage?.input_text_tokens).toBe(5);
		expect((result as any).bill?.usage?.image_pixels).toBe(2_000_000);
		expect((result as any).bill?.usage?.video_pixels).toBe(35_631_232);
		expect((result as any).bill?.usage?.total_tokens).toBe(32_083);
	});

	it("normalizes duplicated data URL prefixes for voyage multimodal inputs", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/multimodalembeddings",
				response: jsonResponse({
					object: "list",
					model: "voyage-multimodal-3.5",
					data: [{ object: "embedding", index: 0, embedding: [0.11, 0.22] }],
					usage: {
						text_tokens: 3,
						image_pixels: 50_000,
						total_tokens: 93,
					},
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-multimodal-3.5",
				input: [[
					{ type: "text", text: "A tiny multimodal probe" } as any,
					{
						type: "image",
						source: "data",
						data: "data:image/png;base64,AAAA",
					} as any,
				]],
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls).toHaveLength(1);
		expect(mock.calls[0]?.bodyJson?.inputs?.[0]?.content).toEqual([
			{ type: "text", text: "A tiny multimodal probe" },
			{ type: "image_base64", image_base64: "data:image/png;base64,AAAA" },
		]);
		expect(
			String(mock.calls[0]?.bodyJson?.inputs?.[0]?.content?.[1]?.image_base64 ?? ""),
		).not.toContain("data:image/jpeg;base64,data:image/");
		expect((result as any).bill?.usage?.input_text_tokens).toBe(3);
		expect((result as any).bill?.usage?.image_pixels).toBe(50_000);
		expect((result as any).bill?.usage?.total_tokens).toBe(93);
	});

	it("sends voyage base64 images and videos as the documented data URLs", async () => {
		setupRuntimeFromEnv({
			VOYAGE_API_KEY: "test-voyage-key",
		} as any);

		const mock = installFetchMock([
			{
				match: (url) => url === "https://api.voyage.example/v1/multimodalembeddings",
				response: jsonResponse({
					object: "list",
					model: "voyage-multimodal-3.5",
					data: [{ object: "embedding", index: 0, embedding: [0.11, 0.22] }],
					usage: { text_tokens: 2, image_pixels: 50_000, video_pixels: 100_000, total_tokens: 260 },
				}),
			},
		]);

		const result = await executor(buildArgs({
			providerId: "voyage",
			ir: {
				model: "voyage/voyage-multimodal-3.5",
				input: [[
					{ type: "text", text: "Raw base64 media" } as any,
					{ type: "image", source: "data", data: "iVBORw0KGgo=", mimeType: "image/png" } as any,
					{ type: "video", url: "data:video/mp4;base64,AAAAIGZ0eXA=" } as any,
				]],
			},
		}));
		mock.restore();

		expect(result.kind).toBe("completed");
		expect(mock.calls[0]?.bodyJson?.inputs?.[0]?.content).toEqual([
			{ type: "text", text: "Raw base64 media" },
			{ type: "image_base64", image_base64: "data:image/png;base64,iVBORw0KGgo=" },
			{ type: "video_base64", video_base64: "data:video/mp4;base64,AAAAIGZ0eXA=" },
		]);
		expect((result as any).bill?.usage?.image_pixels).toBe(50_000);
		expect((result as any).bill?.usage?.video_pixels).toBe(100_000);
	});
});
