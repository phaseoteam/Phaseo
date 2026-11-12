import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachServerToolUsageToRawUsage, buildServerToolContinuation } from "./server-tools";

const getBindingsMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: (...args: any[]) => getBindingsMock(...args),
}));

const baseConfig = {
	enabled: true,
	datetimeDefaultTimezones: ["UTC"],
	webSearchEnabled: true,
	webSearchMaxResults: 5,
	webSearchIncludeText: false,
	webSearchIncludeHighlights: true,
	webFetchEnabled: true,
	webFetchMaxChars: 12000,
};

function toolCallResponse(name: string, args: Record<string, unknown>) {
	return {
		choices: [{
			message: {
				role: "assistant",
				content: [],
				toolCalls: [{ id: `call_${name}`, name, arguments: JSON.stringify(args) }],
			},
			finishReason: "tool_calls",
		}],
	} as any;
}

describe("billable managed web tool meters", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
	});
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("does not bill a search that failed before reaching a provider", async () => {
		getBindingsMock.mockReturnValue({});
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_search", { query: "phaseo pricing", engine: "exa" }),
			baseConfig as any,
		);

		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ error: "search_not_configured" });
		expect(continuation?.usage.webSearchRequests).toBe(1);
		const raw = attachServerToolUsageToRawUsage({}, continuation!.usage);
		expect(raw?.server_tool_web_search_requests).toBe(0);
	});

	it("bills a completed Exa search", async () => {
		getBindingsMock.mockReturnValue({ EXA_API_KEY: "exa_test_key", EXA_BASE_URL: "https://api.exa.ai" });
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
			requestId: "exa_req",
			results: [{ title: "Phaseo", url: "https://phaseo.app" }],
		}), { status: 200, headers: { "Content-Type": "application/json" } })));
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_search", { query: "phaseo pricing", engine: "exa" }),
			baseConfig as any,
		);

		const raw = attachServerToolUsageToRawUsage({}, continuation!.usage);
		expect(raw?.server_tool_web_search_requests).toBe(1);
	});

	it("does not bill a direct fetch, which runs on the Worker", async () => {
		getBindingsMock.mockReturnValue({});
		vi.stubGlobal("fetch", vi.fn(async () => new Response("hello", { status: 200, headers: { "Content-Type": "text/plain" } })));
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_fetch", { url: "https://example.com/page", engine: "direct" }),
			baseConfig as any,
		);

		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ provider: "fetch", engine: "direct" });
		expect(continuation?.usage.webFetchRequests).toBe(1);
		const raw = attachServerToolUsageToRawUsage({}, continuation!.usage);
		expect(raw?.server_tool_use.web_fetch_requests).toBe(1);
		expect(raw?.server_tool_web_fetch_requests).toBe(0);
	});

	it.each([
		["phaseo_web_search", { query: "phaseo pricing", engine: "exa" }],
		["phaseo_web_search", { query: "phaseo pricing", engine: "parallel" }],
		["phaseo_web_search", { query: "phaseo pricing", engine: "firecrawl" }],
		["phaseo_web_search", { query: "phaseo pricing", engine: "perplexity" }],
	])("refuses a paid %s engine when the wallet cannot pay (%o)", async (name, args) => {
		getBindingsMock.mockReturnValue({ EXA_API_KEY: "k", PARALLEL_API_KEY: "k", FIRECRAWL_API_KEY: "k", PERPLEXITY_API_KEY: "k" });
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const continuation = await buildServerToolContinuation(toolCallResponse(name, args), baseConfig as any, { paidToolsAllowed: false });

		expect(fetchMock).not.toHaveBeenCalled();
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ error: "insufficient_credits" });
		expect(attachServerToolUsageToRawUsage({}, continuation!.usage)?.server_tool_web_search_requests).toBe(0);
	});

	it.each(["exa", "parallel", "firecrawl"])("refuses a %s fetch when the wallet cannot pay", async (engine) => {
		getBindingsMock.mockReturnValue({ EXA_API_KEY: "k", PARALLEL_API_KEY: "k", FIRECRAWL_API_KEY: "k" });
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const continuation = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_fetch", { url: "https://example.com/page" }),
			{ ...baseConfig, webFetchEngine: engine } as any,
			{ paidToolsAllowed: false },
		);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(JSON.parse(String(continuation?.toolResults[0]?.content))).toMatchObject({ error: "insufficient_credits", engine });
	});

	it("still runs free TinyFish searches and direct fetches from an empty wallet", async () => {
		getBindingsMock.mockReturnValue({ TINYFISH_API_KEY: "k" });
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).includes("tinyfish")
			? new Response(JSON.stringify({ results: [{ title: "Phaseo", url: "https://phaseo.app" }] }), { status: 200, headers: { "Content-Type": "application/json" } })
			: new Response("hello", { status: 200, headers: { "Content-Type": "text/plain" } })));
		const search = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_search", { query: "phaseo", engine: "tinyfish" }), baseConfig as any, { paidToolsAllowed: false });
		const fetched = await buildServerToolContinuation(
			toolCallResponse("phaseo_web_fetch", { url: "https://example.com/page" }), { ...baseConfig, webFetchEngine: "direct" } as any, { paidToolsAllowed: false });

		expect(search?.toolResults[0]?.isError).toBeFalsy();
		expect(fetched?.toolResults[0]?.isError).toBeFalsy();
	});
});
