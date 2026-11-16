import { describe, expect, it } from "vitest";
import { deepseekQuirks } from "../../providers/deepseek/quirks";
import { openAIChatToIR } from "../../transform-chat";
import { resolveStreamForProtocol } from "../../index";

function transform(request: Record<string, any>): Record<string, any> {
	deepseekQuirks.transformRequest?.({ request, ir: { model: "deepseek/deepseek-v4.1-flash-1017" } as any });
	return request;
}

describe("DeepSeek native web tools", () => {
	it("sends OpenAI hosted web search as deepseek_web_search without its options", () => {
		const request = transform({
			messages: [{ role: "user", content: "news?" }],
			tools: [{ type: "web_search_preview", search_context_size: "high" }],
			tool_choice: "auto",
			logprobs: true,
			top_logprobs: 2,
		});
		expect(request.tools).toEqual([{ type: "deepseek_web_search" }]);
		expect(request.tool_choice).toBe("auto");
		expect(request.logprobs).toBeUndefined();
		expect(request.top_logprobs).toBeUndefined();
	});

	it("maps Anthropic web search and web fetch, declaring each DeepSeek tool once", () => {
		const request = transform({
			messages: [{ role: "user", content: "read https://example.com" }],
			tools: [
				{ type: "web_search_20250305", name: "web_search", max_uses: 3 },
				{ type: "web_search" },
				{ type: "web_fetch_20260209", name: "web_fetch" },
			],
		});
		expect(request.tools).toEqual([{ type: "deepseek_web_search" }, { type: "deepseek_read_url" }]);
	});

	it.each([
		["allowed domains", { type: "web_search_20250305", name: "web_search", allowed_domains: ["example.com"] }],
		["blocked domains", { type: "web_fetch_20260209", name: "web_fetch", blocked_domains: ["example.com"] }],
		["a user location", { type: "web_search_preview", user_location: { type: "approximate", country: "GB" } }],
	])("leaves a web tool with %s as sent, so DeepSeek rejects it instead of dropping the restriction", (_label, tool) => {
		const request = transform({ messages: [], tools: [tool] });
		expect(request.tools).toEqual([tool]);
	});

	it.each([
		["required", "required"],
		["a named tool", { type: "tool", name: "web_search" }],
	])("leaves web tools as sent when tool_choice is %s, which DeepSeek cannot enforce", (_label, toolChoice) => {
		const tools = [{ type: "web_search_20250305", name: "web_search" }];
		const request = transform({ messages: [], tools, tool_choice: toolChoice });
		expect(request.tools).toEqual(tools);
		expect(request.tool_choice).toEqual(toolChoice);
	});

	it("keeps tool_choice none, which turns the web tools off", () => {
		const request = transform({ messages: [], tools: [{ type: "web_search" }], tool_choice: "none" });
		expect(request.tool_choice).toBe("none");
	});

	it("leaves function-only requests untouched", () => {
		const tools = [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }];
		const request = transform({ messages: [], tools, tool_choice: "required", logprobs: true });
		expect(request.tools).toEqual(tools);
		expect(request.tool_choice).toBe("required");
		expect(request.logprobs).toBe(true);
	});

	it("reports billed searches and fetches, not DeepSeek's display-only counts", () => {
		const response: Record<string, any> = {
			usage: {
				prompt_tokens: 100,
				completion_tokens: 20,
				server_tool_use: {
					tool_search: 2,
					tool_image_search: 1,
					tool_fetch: 1,
					web_search_requests: 5,
					web_fetch_requests: 3,
				},
			},
		};
		deepseekQuirks.normalizeResponse?.({ response, ir: {} as any });
		expect(response.usage.server_tool_use).toMatchObject({
			web_search_requests: 3,
			web_fetch_requests: 1,
		});
	});

	it("normalizes the final streamed chunk's usage too", () => {
		const chunk: Record<string, any> = {
			choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
			usage: { server_tool_use: { tool_search: 4 } },
		};
		deepseekQuirks.transformStreamChunk?.({ chunk, accumulated: {} });
		expect(chunk.usage.server_tool_use).toMatchObject({ web_search_requests: 4, web_fetch_requests: 0 });
	});
});

// DeepSeek returns the pages behind a web answer only in server_tool_calls; this is the
// shape of a live response (2026-11-16), trimmed.
const SERVER_TOOL_CALLS = [
	{
		index: 0,
		reasoning_content: "Need to search.",
		calls: [{
			index: 0,
			id: "srvtoolu_ds_00_a",
			type: "deepseek_web_search",
			kind: "deep_search",
			action: { type: "search", queries: ["latest Node.js LTS"] },
			status: "completed",
			sources: [
				{ type: "url", url: "https://nodejs.org/blog/release/v26.13.0", title: "Node.js 26.13.0 (LTS)", snippet: "LTS" },
				{ type: "url", url: "https://nodesource.com/blog/update", title: "How to update Node.js" },
			],
		}],
	},
	{
		index: 1,
		reasoning_content: "",
		calls: [
			{ index: 0, id: "srvtoolu_ds_01_b", type: "deepseek_web_search", kind: "deep_search", action: { type: "open_page", url: "https://nodejs.org/en/about/previous-releases" }, status: "completed" },
			{ index: 1, id: "srvtoolu_rl_00_c", type: "deepseek_read_url", kind: "read_link", action: { type: "read_link", url: "https://nodejs.org/blog/release/v26.13.0" }, status: "completed", page: { url: "https://nodejs.org/blog/release/v26.13.0", title: "Node.js 26.13.0 (LTS)" } },
		],
	},
];
const CITED = [
	{ type: "url_citation", url: "https://nodejs.org/blog/release/v26.13.0", title: "Node.js 26.13.0 (LTS)" },
	{ type: "url_citation", url: "https://nodesource.com/blog/update", title: "How to update Node.js" },
	{ type: "url_citation", url: "https://nodejs.org/en/about/previous-releases" },
];

describe("DeepSeek web tool sources", () => {
	it("cite every page a buffered answer searched, opened or read, once each", () => {
		const ir = openAIChatToIR({
			id: "chatcmpl-1",
			choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Node.js 26 is the LTS line.", server_tool_calls: SERVER_TOOL_CALLS } }],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, server_tool_use: { tool_search: 2, tool_fetch: 1, tool_image_search: 0 } },
		}, "req_1", "deepseek-flash", "deepseek");
		const text = ir.choices[0].message.content.find((part: any) => part.type === "text") as any;
		expect(text.annotations).toEqual(CITED);
	});

	it.each([
		["openai.chat.completions", "chat.completions"],
		["openai.responses", "responses"],
	] as const)("stream the sources to %s clients", async (protocol, endpoint) => {
		const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
			`data: ${JSON.stringify({ id: "chatcmpl-1", object: "chat.completion.chunk", created: 1700000000, model: "deepseek-flash", choices: [{ index: 0, delta, finish_reason: null, ...extra }] })}\n\n`;
		const body = [
			chunk({ role: "assistant", content: "", server_tool_calls: SERVER_TOOL_CALLS }),
			chunk({ content: "Node.js 26 is the LTS line." }),
			chunk({}, { finish_reason: "stop" }),
			"data: [DONE]\n\n",
		].join("");
		const upstream = new Response(body, { headers: { "Content-Type": "text/event-stream" } });
		const text = await new Response(resolveStreamForProtocol(upstream, {
			ir: { messages: [{ role: "user", content: [{ type: "text", text: "LTS?" }] }], model: "deepseek-flash", stream: true },
			requestId: "req_1", workspaceId: "team_test", providerId: "deepseek", endpoint, protocol,
			capability: "text.generate", byokMeta: [], pricingCard: null, meta: {},
		} as any, "chat")).text();
		// Responses frames name their event on the `event:` line.
		const frames = text.split("\n\n").flatMap((block) => {
			const data = block.split("\n").find((line) => line.startsWith("data: {"));
			if (!data) return [];
			const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice(7);
			const payload = JSON.parse(data.slice(6));
			return [{ ...payload, type: payload.type ?? event }];
		});
		const urls = protocol === "openai.responses"
			? frames.filter((frame) => frame.type === "response.output_text.annotation.added").map((frame) => frame.annotation.url)
			: frames.flatMap((frame) => frame.choices ?? []).flatMap((choice: any) => choice.delta?.annotations ?? []).map((annotation: any) => annotation.url_citation.url);
		expect(urls).toEqual(CITED.map((citation) => citation.url));
		if (protocol === "openai.responses") {
			const completed = frames.find((frame) => frame.type === "response.completed").response;
			const message = completed.output.find((item: any) => item.type === "message");
			expect(message.content[0].annotations.map((annotation: any) => annotation.url)).toEqual(CITED.map((citation) => citation.url));
		}
	});
});
