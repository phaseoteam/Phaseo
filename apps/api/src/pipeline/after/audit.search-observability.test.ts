import { describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const auditFailureMock = vi.fn();
const emitGatewayRequestEventMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: (...args: any[]) => auditFailureMock(...args),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: (...args: any[]) => emitGatewayRequestEventMock(...args),
}));

import { handleSuccessAudit } from "./audit";

describe("handleSuccessAudit search observability", () => {
	it("persists normalized search metadata for successful native-search requests", async () => {
		auditSuccessMock.mockReset();
		auditFailureMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);

		await handleSuccessAudit(
			{
				requestId: "req_search_1",
				workspaceId: "ws_search",
				endpoint: "responses",
				capability: "text.generate",
				model: "openai/gpt-5.4",
				stream: false,
				body: {
					model: "openai/gpt-5.4",
					tools: [{ type: "web_search_preview_2025_03_11" }],
				},
				rawBody: {
					model: "openai/gpt-5.4",
					tools: [{ type: "web_search_preview_2025_03_11" }],
				},
				meta: {
					requestId: "req_search_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
				},
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
				},
			} as any,
			{
				kind: "completed",
				upstream: new Response("{}", {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
				provider: "openai",
				generationTimeMs: 120,
				bill: {
					cost_cents: 0,
					currency: "USD",
					usage: null,
					finish_reason: "stop",
				},
				mappedRequest: null,
				rawResponse: {
					output: [
						{
							type: "web_search_call",
							query: "ai stats docs routing guide",
							status: "completed",
						},
						{
							type: "message",
							role: "assistant",
							content: [
								{
									type: "output_text",
									text: "Grounded answer",
									annotations: [
										{
											type: "url_citation",
											title: "Phaseo Docs",
											url: "https://example.com/docs",
											quoted_text: "Useful source text",
										},
									],
								},
								{
									type: "web_search_result",
									title: "Phaseo Docs",
									url: "https://example.com/docs",
									text: "Docs summary",
								},
							],
						},
					],
				},
			} as any,
			false,
			{ output_tokens: 12, total_tokens: 12 },
			0,
			0,
			"USD",
			"stop",
			200,
			"resp_native_1",
			{ id: "resp_native_1" },
		);

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const call = auditSuccessMock.mock.calls[0][0];
		expect(call.detailMetadata.search_observability).toEqual({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: "web_search_result",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: "Docs summary",
				},
			],
			citations: [
				{
					type: "url_citation",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Useful source text",
				},
			],
			nativeSearches: [
				{
					type: "web_search_call",
					query: "ai stats docs routing guide",
					status: "completed",
				},
			],
			managedSearches: [],
		});

		const extraJson = JSON.parse(call.extraJson);
		expect(extraJson.transform.search_observability).toEqual(
			call.detailMetadata.search_observability,
		);
	});

	it("persists managed server-search metadata even without native search tools", async () => {
		auditSuccessMock.mockReset();
		auditFailureMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);

		await handleSuccessAudit(
			{
				requestId: "req_search_managed_1",
				workspaceId: "ws_search",
				endpoint: "responses",
				capability: "text.generate",
				model: "openai/gpt-5.4",
				stream: false,
				body: {
					model: "openai/gpt-5.4",
					tools: [
						{
							type: "function",
							function: { name: "ai_stats_web_search" },
						},
					],
				},
				rawBody: {
					model: "openai/gpt-5.4",
					tools: [{ type: "ai-stats:web_search" }],
				},
				searchObservability: {
					usedNativeWebSearch: false,
					usedManagedWebSearch: true,
					resultCount: 1,
					citationCount: 1,
					results: [
						{
							type: null,
							title: "Phaseo Docs",
							url: "https://example.com/docs",
							snippet: "Managed summary",
						},
					],
					citations: [
						{
							type: "managed_web_search_result",
							title: "Phaseo Docs",
							url: "https://example.com/docs",
							text: "Managed highlight",
						},
					],
					nativeSearches: [],
					managedSearches: [
						{
							provider: "exa",
							query: "ai stats docs",
							requestId: "req_exa_1",
							searchType: "auto",
							resultCount: 1,
						},
					],
				},
				meta: {
					requestId: "req_search_managed_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
				},
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
				},
			} as any,
			{
				kind: "completed",
				upstream: new Response("{}", {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
				provider: "openai",
				generationTimeMs: 120,
				bill: {
					cost_cents: 0,
					currency: "USD",
					usage: null,
					finish_reason: "stop",
				},
				mappedRequest: null,
				rawResponse: {
					output: [
						{
							type: "message",
							role: "assistant",
							content: [{ type: "output_text", text: "Grounded answer" }],
						},
					],
				},
			} as any,
			false,
			{ output_tokens: 12, total_tokens: 12 },
			0,
			0,
			"USD",
			"stop",
			200,
			"resp_managed_1",
			{ id: "resp_managed_1" },
		);

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const call = auditSuccessMock.mock.calls[0][0];
		expect(call.detailMetadata.search_observability).toEqual({
			usedNativeWebSearch: false,
			usedManagedWebSearch: true,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: null,
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: "Managed summary",
				},
			],
			citations: [
				{
					type: "managed_web_search_result",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Managed highlight",
				},
			],
			nativeSearches: [],
			managedSearches: [
				{
					provider: "exa",
					query: "ai stats docs",
					requestId: "req_exa_1",
					searchType: "auto",
					resultCount: 1,
				},
			],
		});
	});

	it("persists grounding-metadata search observability for successful requests", async () => {
		auditSuccessMock.mockReset();
		auditFailureMock.mockReset();
		emitGatewayRequestEventMock.mockReset();
		auditSuccessMock.mockResolvedValue(undefined);
		emitGatewayRequestEventMock.mockResolvedValue(undefined);

		await handleSuccessAudit(
			{
				requestId: "req_search_grounding_1",
				workspaceId: "ws_search",
				endpoint: "responses",
				capability: "text.generate",
				model: "google/gemini-2.5-flash",
				stream: false,
				body: {
					model: "google/gemini-2.5-flash",
				},
				rawBody: {
					model: "google/gemini-2.5-flash",
				},
				meta: {
					requestId: "req_search_grounding_1",
					apiKeyId: "key_1",
					apiKeyRef: "kid_key_1",
					apiKeyKid: "kid_key_1",
					authMethod: "api_key",
				},
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: true, reason: null, resetAt: null },
				},
			} as any,
			{
				kind: "completed",
				upstream: new Response("{}", {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
				provider: "google",
				generationTimeMs: 120,
				bill: {
					cost_cents: 0,
					currency: "USD",
					usage: null,
					finish_reason: "stop",
				},
				mappedRequest: null,
				rawResponse: {
					candidates: [
						{
							groundingMetadata: {
								webSearchQueries: ["ai stats gateway web search"],
								groundingChunks: [
									{
										web: {
											uri: "https://example.com/docs",
											title: "Phaseo Docs",
										},
									},
								],
								groundingSupports: [
									{
										segment: {
											text: "Grounded answer segment",
										},
										groundingChunkIndices: [0],
									},
								],
							},
						},
					],
				},
			} as any,
			false,
			{ output_tokens: 12, total_tokens: 12 },
			0,
			0,
			"USD",
			"stop",
			200,
			"resp_grounding_1",
			{ id: "resp_grounding_1" },
		);

		expect(auditSuccessMock).toHaveBeenCalledTimes(1);
		const call = auditSuccessMock.mock.calls[0][0];
		expect(call.detailMetadata.search_observability).toEqual({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: "grounding_chunk",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: null,
				},
			],
			citations: [
				{
					type: "grounding_support",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Grounded answer segment",
				},
			],
			nativeSearches: [
				{
					type: "google_search_query",
					query: "ai stats gateway web search",
					status: null,
				},
			],
			managedSearches: [],
		});
	});
});
