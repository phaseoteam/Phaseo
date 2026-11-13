import { describe, expect, it } from "vitest";
import { deepseekQuirks } from "../../providers/deepseek/quirks";

function transform(request: Record<string, any>): Record<string, any> {
	deepseekQuirks.transformRequest?.({ request, ir: { model: "deepseek/deepseek-v4.1-flash-1017" } as any });
	return request;
}

describe("DeepSeek native web tools", () => {
	it("sends OpenAI hosted web search as deepseek_web_search without its options", () => {
		const request = transform({
			messages: [{ role: "user", content: "news?" }],
			tools: [{ type: "web_search_preview", search_context_size: "high", user_location: { type: "approximate", country: "GB" } }],
			tool_choice: "required",
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
			tool_choice: { type: "tool", name: "web_search" },
		});
		expect(request.tools).toEqual([{ type: "deepseek_web_search" }, { type: "deepseek_read_url" }]);
		expect(request.tool_choice).toBe("auto");
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
