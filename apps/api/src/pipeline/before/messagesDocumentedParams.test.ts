// Documented /v1/messages parameters (simulator finding N11).
import { describe, expect, it } from "vitest";
import { AnthropicMessagesSchema } from "@core/schemas";
import { extractRequestedParams, getUnknownTopLevelParams } from "./paramCapabilities";
import { validateSynchronousTextServiceTierRequest } from "./serviceTierValidation";

const base = {
	model: "anthropic/claude-sonnet-5",
	max_tokens: 256,
	messages: [{ role: "user", content: "Hello" }],
};

describe("/v1/messages documented parameters", () => {
	it("accepts session_id, reasoning and provider_options", () => {
		const body = {
			...base,
			session_id: "sess_123",
			reasoning: { effort: "high", summary: "auto" },
			provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } },
		};
		expect(AnthropicMessagesSchema.safeParse(body).success).toBe(true);
		expect(getUnknownTopLevelParams("messages", body)).toEqual([]);
	});

	it("routes reasoning like thinking and keeps session_id out of the requested params", () => {
		const params = extractRequestedParams("messages", {
			...base,
			session_id: "sess_123",
			reasoning: { effort: "high" },
		});
		expect(params).toContain("reasoning.effort");
		expect(params).not.toContain("session_id");
	});

	// https://platform.claude.com/docs/en/api/messages/create (output_config) and
	// https://platform.claude.com/docs/en/build-with-claude/thinking (between_tools, xhigh).
	it.each([
		{ output_config: { effort: "max" } },
		{ output_config: { effort: "xhigh", format: { type: "json_schema", schema: { type: "object" } } } },
		{ thinking: { type: "between_tools" } },
		{ inference_geo: "us" },
	])("accepts the documented %j", (extra) => {
		const body = { ...base, ...extra };
		expect(AnthropicMessagesSchema.safeParse(body).success).toBe(true);
		expect(getUnknownTopLevelParams("messages", body)).toEqual([]);
	});

	it("routes output_config effort and format like reasoning and response_format", () => {
		const params = extractRequestedParams("messages", {
			...base,
			output_config: { effort: "high", format: { type: "json_schema", schema: { type: "object" } } },
		});
		expect(params).toEqual(expect.arrayContaining(["reasoning.effort", "response_format"]));
	});

	it("still rejects parameters the Messages API does not document", () => {
		expect(getUnknownTopLevelParams("messages", { ...base, mcp_servers: [] })).toEqual(["mcp_servers"]);
	});

	// https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages
	describe("mid-conversation system messages", () => {
		const toolUse = { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "run_tests", input: {} }] };
		const toolResult = { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "12 passed" }] };

		it.each([
			["last, after a user turn", [{ role: "user", content: "Review utils.py" }, { role: "system", content: "Include type annotations." }]],
			["followed by an assistant turn", [{ role: "user", content: "Hi" }, { role: "system", content: "Be brief." }, { role: "assistant", content: "Hello." }]],
			["after tool results", [{ role: "user", content: "Run the tests" }, toolUse, toolResult, { role: "system", content: "The user asked you to update the changelog too." }]],
			["after a server tool result", [{ role: "user", content: "Search" }, { role: "assistant", content: [{ type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "x" } }, { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [] }] }, { role: "system", content: "Cite sources." }]],
			["as consecutive system messages", [{ role: "user", content: "Hi" }, { role: "system", content: "Be brief." }, { role: "system", content: [{ type: "text", text: "Use British English.", cache_control: { type: "ephemeral" } }] }]],
		])("accepts one %s", (_label, messages) => {
			expect(AnthropicMessagesSchema.safeParse({ ...base, messages }).success).toBe(true);
		});

		it.each([
			["first", [{ role: "system", content: "Be brief." }, { role: "user", content: "Hi" }], 0],
			["followed by a user turn", [{ role: "user", content: "Hi" }, { role: "system", content: "Be brief." }, { role: "user", content: "Why?" }], 1],
			["after an assistant turn", [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello." }, { role: "system", content: "Be brief." }], 2],
			["between a tool call and its result", [{ role: "user", content: "Run the tests" }, toolUse, { role: "system", content: "Hurry." }, toolResult], 2],
		])("rejects one placed %s, as Claude does", (_label, messages, index) => {
			const result = AnthropicMessagesSchema.safeParse({ ...base, messages });
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]).toMatchObject({ path: ["messages", index], message: expect.stringContaining("must immediately follow a user turn") });
		});

		it.each([
			["clear_at", { clear_at: "next_user_message", content: "Request independent reads in one turn." }],
			["output_config", { output_config: { effort: "low" }, content: "" }],
			["tool_addition blocks", { content: [{ type: "tool_addition", tool: { type: "tool_reference", name: "get_weather" } }] }],
			["an image block", { content: [{ type: "image", source: { type: "url", url: "https://example.com/a.png" } }] }],
			["empty content blocks", { content: [] }],
		])("rejects beta-only or non-text %s", (_label, fields) => {
			const messages = [{ role: "user", content: "Hi" }, { role: "system", ...fields }];
			expect(AnthropicMessagesSchema.safeParse({ ...base, messages }).success).toBe(false);
		});
	});

	it.each(["auto", "standard_only"])("accepts Anthropic's service_tier %s", (serviceTier) => {
		const body = { ...base, service_tier: serviceTier };
		expect(AnthropicMessagesSchema.safeParse(body).success).toBe(true);
		expect(validateSynchronousTextServiceTierRequest({
			endpoint: "messages",
			body,
			requestId: "req_test",
			workspaceId: "workspace_test",
		}).ok).toBe(true);
	});
});
