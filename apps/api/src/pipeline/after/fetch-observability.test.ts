import { describe, expect, it } from "vitest";
import {
	buildManagedWebFetchObservabilityFromToolResults,
	mergeWebFetchObservability,
} from "./fetch-observability";

describe("buildManagedWebFetchObservabilityFromToolResults", () => {
	it("extracts normalized managed web-fetch metadata from server tool results", () => {
		const observability = buildManagedWebFetchObservabilityFromToolResults([
			{
				content: JSON.stringify({
					provider: "fetch",
					url: "https://example.com/docs",
					final_url: "https://www.example.com/docs",
					status: 200,
					content_type: "text/html; charset=utf-8",
					title: "AI Stats Docs",
					text: "Long body omitted from observability",
					truncated: true,
					returned_chars: 12000,
				}),
			},
		]);

		expect(observability).toEqual({
			requestCount: 1,
			fetches: [
				{
					provider: "fetch",
					url: "https://example.com/docs",
					finalUrl: "https://www.example.com/docs",
					title: "AI Stats Docs",
					status: 200,
					contentType: "text/html; charset=utf-8",
					returnedChars: 12000,
					truncated: true,
				},
			],
		});
	});

	it("ignores errored and non-fetch tool results", () => {
		const observability = buildManagedWebFetchObservabilityFromToolResults([
			{
				isError: true,
				content: JSON.stringify({ provider: "fetch", url: "https://example.com" }),
			},
			{
				content: JSON.stringify({ provider: "exa", query: "ignored" }),
			},
		]);

		expect(observability).toBeNull();
	});
});

describe("mergeWebFetchObservability", () => {
	it("deduplicates repeated fetch entries across turns", () => {
		const merged = mergeWebFetchObservability(
			{
				requestCount: 1,
				fetches: [
					{
						provider: "fetch",
						url: "https://example.com/docs",
						finalUrl: "https://example.com/docs",
						title: "Docs",
						status: 200,
						contentType: "text/html",
						returnedChars: 512,
						truncated: false,
					},
				],
			},
			{
				requestCount: 1,
				fetches: [
					{
						provider: "fetch",
						url: "https://example.com/docs",
						finalUrl: "https://example.com/docs",
						title: "Docs",
						status: 200,
						contentType: "text/html",
						returnedChars: 512,
						truncated: false,
					},
				],
			},
		);

		expect(merged).toEqual({
			requestCount: 1,
			fetches: [
				{
					provider: "fetch",
					url: "https://example.com/docs",
					finalUrl: "https://example.com/docs",
					title: "Docs",
					status: 200,
					contentType: "text/html",
					returnedChars: 512,
					truncated: false,
				},
			],
		});
	});
});
