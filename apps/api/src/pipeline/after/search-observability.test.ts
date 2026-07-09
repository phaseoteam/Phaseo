import { describe, expect, it } from "vitest";
import {
	buildManagedSearchObservabilityFromToolResults,
	extractSearchObservability,
	mergeSearchObservability,
} from "./search-observability";

describe("extractSearchObservability", () => {
	it("extracts normalized search results and citations from provider payloads", () => {
		const observability = extractSearchObservability({
			body: {
				tools: [{ type: "web_search_preview_2025_03_11" }],
			},
			providerResponse: {
				output: [
					{
						type: "message",
						role: "assistant",
						content: [
							{
								type: "output_text",
								text: "Answer",
								annotations: [
									{
										type: "url_citation",
										title: "Phaseo Blog",
										url: "https://example.com/blog",
										quoted_text: "Quoted source text",
									},
								],
							},
							{
								type: "web_search_result",
								title: "Phaseo Blog",
								url: "https://example.com/blog",
								text: "Helpful summary",
							},
						],
					},
				],
			},
		});

		expect(observability).toEqual({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: "web_search_result",
					title: "Phaseo Blog",
					url: "https://example.com/blog",
					snippet: "Helpful summary",
				},
			],
			citations: [
				{
					type: "url_citation",
					title: "Phaseo Blog",
					url: "https://example.com/blog",
					text: "Quoted source text",
				},
			],
			nativeSearches: [],
			managedSearches: [],
		});
	});

	it("returns native search intent even when only citations survive", () => {
		const observability = extractSearchObservability({
			body: {
				web_search_options: { search_context_size: "low" },
			},
			gatewayResponse: {
				choices: [
					{
						message: {
							content: "Grounded answer",
							annotations: [
								{
									type: "url_citation",
									url: "https://example.com/docs",
								},
							],
						},
					},
				],
			},
		});

		expect(observability).toMatchObject({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 0,
			citationCount: 1,
			nativeSearches: [],
		});
	});

	it("extracts native search call details when providers expose them", () => {
		const observability = extractSearchObservability({
			body: {
				tools: [{ type: "web_search_preview_2025_03_11" }],
			},
			providerResponse: {
				output: [
					{
						type: "web_search_call",
						query: "latest gateway caching guidance",
						status: "completed",
					},
					{
						type: "web_search_tool_call",
						arguments: JSON.stringify({
							query: "upstash response cache ttl strategy",
						}),
						status: "completed",
					},
				],
			},
		});

		expect(observability).toMatchObject({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 0,
			citationCount: 0,
			nativeSearches: [
				{
					type: "web_search_call",
					query: "latest gateway caching guidance",
					status: "completed",
				},
				{
					type: "web_search_tool_call",
					query: "upstash response cache ttl strategy",
					status: "completed",
				},
			],
		});
	});

	it("normalizes Gemini-style grounding metadata into results, citations, and queries", () => {
		const observability = extractSearchObservability({
			body: {},
			providerResponse: {
				candidates: [
					{
						groundingMetadata: {
							webSearchQueries: ["phaseo gateway web search"],
							groundingChunks: [
								{
									web: {
										uri: "https://example.com/docs",
										title: "Phaseo Docs",
									},
								},
								{
									web: {
										uri: "https://example.com/blog",
										title: "Phaseo Blog",
									},
								},
							],
							groundingSupports: [
								{
									segment: {
										text: "Docs-backed answer segment",
									},
									groundingChunkIndices: [0, 1],
								},
							],
						},
					},
				],
			},
		});

		expect(observability).toEqual({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 2,
			citationCount: 2,
			results: [
				{
					type: "grounding_chunk",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: null,
				},
				{
					type: "grounding_chunk",
					title: "Phaseo Blog",
					url: "https://example.com/blog",
					snippet: null,
				},
			],
			citations: [
				{
					type: "grounding_support",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Docs-backed answer segment",
				},
				{
					type: "grounding_support",
					title: "Phaseo Blog",
					url: "https://example.com/blog",
					text: "Docs-backed answer segment",
				},
			],
			nativeSearches: [
				{
					type: "google_search_query",
					query: "phaseo gateway web search",
					status: null,
				},
			],
			managedSearches: [],
		});
	});

	it("returns null when no search signals exist", () => {
		expect(
			extractSearchObservability({
				body: {},
				gatewayResponse: { output_text: "plain answer" },
				providerResponse: { output_text: "plain answer" },
			}),
		).toBeNull();
	});

	it("extracts managed web search observability from server tool results", () => {
		const observability = buildManagedSearchObservabilityFromToolResults([
			{
				content: JSON.stringify({
					provider: "exa",
					request_id: "req_exa_1",
					search_type: "auto",
					query: "phaseo gateway docs",
					results: [
						{
							title: "Phaseo Docs",
							url: "https://example.com/docs",
							highlights: ["Helpful snippet"],
							text: "Longer page text",
						},
					],
				}),
			},
		]);

		expect(observability).toEqual({
			usedNativeWebSearch: false,
			usedManagedWebSearch: true,
			resultCount: 1,
			citationCount: 1,
			results: [
				{
					type: null,
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					snippet: "Longer page text",
				},
			],
			citations: [
				{
					type: "managed_web_search_result",
					title: "Phaseo Docs",
					url: "https://example.com/docs",
					text: "Helpful snippet",
				},
			],
			nativeSearches: [],
			managedSearches: [
				{
					provider: "exa",
					query: "phaseo gateway docs",
					requestId: "req_exa_1",
					searchType: "auto",
					resultCount: 1,
				},
			],
		});
	});

	it("merges native and managed search observability into one payload", () => {
		const merged = mergeSearchObservability(
			extractSearchObservability({
				body: {
					tools: [{ type: "web_search_preview_2025_03_11" }],
				},
				providerResponse: {
					output: [
						{
							type: "web_search_result",
							title: "Native result",
							url: "https://example.com/native",
							text: "Native snippet",
						},
					],
				},
			}),
			buildManagedSearchObservabilityFromToolResults([
				{
					content: JSON.stringify({
						provider: "exa",
						query: "managed query",
						results: [
							{
								title: "Managed result",
								url: "https://example.com/managed",
								summary: "Managed summary",
							},
						],
					}),
				},
			]),
		);

		expect(merged).toMatchObject({
			usedNativeWebSearch: true,
			usedManagedWebSearch: true,
			resultCount: 2,
			citationCount: 1,
			nativeSearches: [],
		});
		expect(merged?.managedSearches).toHaveLength(1);
	});
});
