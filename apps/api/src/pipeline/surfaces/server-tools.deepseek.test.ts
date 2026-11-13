import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDeepSeekSearchQuery, buildServerToolContinuation } from "./server-tools";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: (...args: any[]) => getBindingsMock(...args),
}));

const CONFIG = {
	enabled: true,
	datetimeDefaultTimezones: ["UTC"],
	webSearchEnabled: true,
	webSearchMaxResults: 5,
	webSearchIncludeText: false,
	webSearchIncludeHighlights: true,
	webFetchEnabled: true,
	webFetchEngine: "deepseek",
	webFetchMaxChars: 12000,
} as any;

function toolCallResponse(name: string, args: Record<string, unknown>): any {
	return {
		choices: [{
			message: {
				role: "assistant",
				content: [],
				toolCalls: [{ id: "call_ds", name, arguments: JSON.stringify(args) }],
			},
			finishReason: "tool_calls",
		}],
	};
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("DeepSeek web search and fetch engine", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		getBindingsMock.mockReturnValue({ DEEPSEEK_API_KEY: "ds_test_key", DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1" });
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("searches DeepSeek with domain operators and returns its summaries as highlights", async () => {
		const fetchMock = vi.fn(async () => json({
			results: [
				{
					rerank_score: 2.1,
					title: "DeepSeek V4 release",
					url: "https://example.com/v4",
					snippet: "Short snippet.",
					summary: "A longer summary written for a model to read.",
					content: "",
					site_name: "Example",
					site_icon: null,
					date: "2026-11-01T00:00:00Z",
					authority: 3,
				},
			],
		}));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_search", {
				query: "DeepSeek V4 release",
				engine: "deepseek",
				max_results: 3,
				allowed_domains: ["example.com"],
				excluded_domains: ["reddit.com"],
				language: "en",
			}),
			CONFIG,
		);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.deepseek.com/v1/tools/search");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer ds_test_key");
		expect(JSON.parse(String(init.body))).toEqual({
			query: "DeepSeek V4 release lang:en site:example.com -site:reddit.com",
			count: 3,
			need_content: false,
		});
		expect(continuation?.usage).toMatchObject({
			webSearchRequests: 1,
			billableWebSearchRequests: 1,
			webSearchResults: 1,
			webSearchExtraResults: 0,
		});
		const parsed = JSON.parse(String(continuation?.toolResults[0]?.content));
		expect(parsed).toMatchObject({
			provider: "deepseek",
			engine: "deepseek",
			results: [{
				title: "DeepSeek V4 release",
				url: "https://example.com/v4",
				snippet: "Short snippet.",
				highlights: ["A longer summary written for a model to read."],
				published_date: "2026-11-01T00:00:00Z",
				text: null,
			}],
		});
	});

	it("does not bill a search that found nothing, as DeepSeek does not", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => json({ results: [] })));
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_search", { query: "nothing here", engine: "deepseek" }),
			CONFIG,
		);
		expect(continuation?.usage).toMatchObject({ webSearchRequests: 1, billableWebSearchRequests: 0, webSearchResults: 0 });
	});

	it("reports a missing key as search_not_configured without calling out", async () => {
		getBindingsMock.mockReturnValue({});
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_search", { query: "q", engine: "deepseek" }),
			CONFIG,
		);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({
			error: "search_not_configured",
			engine: "deepseek",
		});
	});

	it("fetches pages as Markdown through DeepSeek Fetch", async () => {
		const fetchMock = vi.fn(async () => json({ title: "Example article", content: "# Example article\n\nArticle content." }));
		vi.stubGlobal("fetch", fetchMock);

		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_fetch", { url: "https://example.com/article" }),
			CONFIG,
		);

		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.deepseek.com/v1/tools/fetch");
		expect(JSON.parse(String(init.body))).toEqual({ url: "https://example.com/article" });
		expect(continuation?.usage).toMatchObject({ webFetchRequests: 1 });
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({
			provider: "deepseek",
			engine: "deepseek",
			title: "Example article",
			text: "# Example article\n\nArticle content.",
			truncated: false,
		});
	});

	it("surfaces DeepSeek Fetch refusals as tool errors that are not billed", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "blocked", code: "forbidden" } }, 403)));
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_fetch", { url: "https://example.com/private" }),
			CONFIG,
		);
		expect(continuation?.usage).toMatchObject({ webFetchRequests: 0 });
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({
			error: "fetch_request_failed",
			engine: "deepseek",
			status: 403,
		});
	});
});

describe("buildDeepSeekSearchQuery", () => {
	it("keeps the whole query, operators included, within 128 characters", () => {
		const query = buildDeepSeekSearchQuery("x".repeat(200), ["example.com"], []);
		expect(query).not.toBeNull();
		expect(Array.from(query ?? "").length).toBeLessThanOrEqual(128);
		expect(query?.endsWith(" site:example.com")).toBe(true);
	});

	it("joins allowed domains with OR and drops wildcard prefixes", () => {
		expect(buildDeepSeekSearchQuery("ai news", ["*.example.com", "news.org"], ["spam.com"]))
			.toBe("ai news site:example.com OR site:news.org -site:spam.com");
	});

	it("returns null when the domain lists alone fill the query", () => {
		const domains = Array.from({ length: 12 }, (_, i) => `domain-number-${i}.example`);
		expect(buildDeepSeekSearchQuery("q", domains, [])).toBeNull();
	});
});
