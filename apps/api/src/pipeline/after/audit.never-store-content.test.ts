import { beforeEach, describe, expect, it, vi } from "vitest";

const auditSuccessMock = vi.fn();
const persistDataContributionMock = vi.fn();

vi.mock("../audit", () => ({
	auditSuccess: (...args: any[]) => auditSuccessMock(...args),
	auditFailure: vi.fn(),
}));

vi.mock("@observability/events", () => ({
	emitGatewayRequestEvent: vi.fn(async () => undefined),
}));

vi.mock("../classification/data-contribution", async (importOriginal) => ({
	...(await importOriginal<typeof import("../classification/data-contribution")>()),
	persistDataContribution: (...args: any[]) => persistDataContributionMock(...args),
}));

import { handleSuccessAudit } from "./audit";

function context(neverStoreContent: boolean) {
	return {
		requestId: "req_never_store",
		workspaceId: "ws_never_store",
		endpoint: "responses",
		capability: "text.generate",
		model: "openai/gpt-5.4",
		stream: false,
		neverStoreContent,
		teamSettings: { dataContributionEnabled: true },
		body: { model: "openai/gpt-5.4", input: "private question", tools: [{ type: "web_search_preview_2025_03_11" }] },
		rawBody: { model: "openai/gpt-5.4", input: "private question", tools: [{ type: "web_search_preview_2025_03_11" }] },
		webFetchObservability: {
			requestCount: 1,
			fetches: [{
				provider: "fetch",
				url: "https://example.com/private-page",
				finalUrl: "https://www.example.com/private-page",
				title: "Private page",
				status: 200,
				contentType: "text/html",
				returnedChars: 1200,
				truncated: false,
			}],
		},
		meta: { requestId: "req_never_store", apiKeyId: "key_agent", apiKeyRef: "kid_agent", apiKeyKid: "kid_agent", authMethod: "api_key" },
		providers: [],
		pricing: {},
		gating: {
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null },
		},
	} as any;
}

const result = {
	kind: "completed",
	upstream: new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
	provider: "openai",
	generationTimeMs: 120,
	bill: { cost_cents: 0, currency: "USD", usage: null, finish_reason: "stop" },
	mappedRequest: null,
	rawResponse: {
		output: [
			{ type: "web_search_call", query: "private search query", status: "completed" },
			{
				type: "message",
				role: "assistant",
				content: [
					{
						type: "output_text",
						text: "Answer",
						annotations: [{ type: "url_citation", title: "Private source", url: "https://example.com/source", quoted_text: "private quote" }],
					},
					{ type: "web_search_result", title: "Private source", url: "https://example.com/source", text: "private snippet" },
				],
			},
		],
	},
} as any;

async function audit(neverStoreContent: boolean) {
	await handleSuccessAudit(context(neverStoreContent), result, false, { output_tokens: 12, total_tokens: 12 }, 0, 0, "USD", "stop", 200, "resp_1", { id: "resp_1" });
	return auditSuccessMock.mock.calls[0][0].detailMetadata;
}

describe("handleSuccessAudit for a key that never stores content", () => {
	beforeEach(() => {
		auditSuccessMock.mockReset().mockResolvedValue(undefined);
		persistDataContributionMock.mockReset().mockResolvedValue({ status: "stored" });
	});

	it("keeps search and fetch counts but no queries, results, citations, titles or URLs", async () => {
		const metadata = await audit(true);

		expect(metadata.search_observability).toEqual({
			usedNativeWebSearch: true,
			usedManagedWebSearch: false,
			resultCount: 1,
			citationCount: 1,
			results: [],
			citations: [],
			nativeSearches: [],
			managedSearches: [],
		});
		expect(metadata.web_fetch_observability).toEqual({
			requestCount: 1,
			fetches: [{ provider: "fetch", url: null, finalUrl: null, title: null, status: 200, contentType: "text/html", returnedChars: 1200, truncated: false }],
		});
		expect(JSON.stringify(metadata)).not.toMatch(/private|example\.com/i);
	});

	it("is never sampled for data contribution", async () => {
		await audit(true);
		expect(persistDataContributionMock).not.toHaveBeenCalled();
	});

	it("leaves other keys as they were", async () => {
		const metadata = await audit(false);

		expect(metadata.search_observability.nativeSearches).toEqual([{ type: "web_search_call", query: "private search query", status: "completed" }]);
		expect(metadata.web_fetch_observability.fetches[0].url).toBe("https://example.com/private-page");
		expect(persistDataContributionMock).toHaveBeenCalledTimes(1);
	});
});
