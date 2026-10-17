import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { decodeOpenAIChatRequest } from "../../../../protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "../../../../protocols/openai-responses/decode";
import {
	ANTHROPIC_MAX_CACHE_BREAKPOINTS,
	countAnthropicCacheBreakpoints,
	resolveAnthropicCacheScope,
} from "../cache-control";
import { irToAnthropicMessages } from "../index";

function createBaseRequest(): IRChatRequest {
	return {
		model: "claude-3-7-sonnet",
		stream: false,
		messages: [
			{
				role: "user",
				content: [{ type: "text", text: "Hello" }],
			},
		],
	};
}

const AGENT_CACHE = { type: "ephemeral", scope: "agent" } as const;

function buildToolLoopRequest(steps: number, options?: { toolCount?: number }): IRChatRequest {
	const messages: any[] = [
		{ role: "system", content: [{ type: "text", text: "You are a coding agent." }] },
		{ role: "user", content: [{ type: "text", text: "Fix the failing test." }] },
	];
	for (let step = 0; step < steps; step += 1) {
		messages.push({
			role: "assistant",
			content: [{ type: "text", text: `Step ${step}` }],
			toolCalls: [{ id: `toolu_${step}`, name: "read_file", arguments: "{\"path\":\"a.ts\"}" }],
		});
		messages.push({
			role: "tool",
			toolResults: [{ toolCallId: `toolu_${step}`, content: `result ${step}` }],
		});
	}
	return {
		model: "claude-3-7-sonnet",
		stream: true,
		messages,
		tools: Array.from({ length: options?.toolCount ?? 40 }, (_, index) => ({
			name: `tool_${index}`,
			description: `Tool ${index}`,
			parameters: { type: "object", properties: {} },
		})),
	};
}

/** Lists every block carrying cache_control as a readable path. */
function listBreakpoints(payload: any): string[] {
	const out: string[] = [];
	(payload.tools ?? []).forEach((tool: any, index: number) => {
		if (tool.cache_control) out.push(`tools[${index}]`);
	});
	if (Array.isArray(payload.system)) {
		payload.system.forEach((block: any, index: number) => {
			if (block.cache_control) out.push(`system[${index}]`);
		});
	}
	(payload.messages ?? []).forEach((msg: any, msgIndex: number) => {
		(msg.content ?? []).forEach((block: any, blockIndex: number) => {
			if (block.cache_control) out.push(`messages[${msgIndex}].${block.type}[${blockIndex}]`);
		});
	});
	return out;
}

describe("irToAnthropicMessages cache scopes", () => {
	it("resolves scopes, aliases, and unknown values", () => {
		expect(resolveAnthropicCacheScope({ type: "ephemeral" })).toBe("all_text");
		expect(resolveAnthropicCacheScope({ scope: " All_Text " })).toBe("all_text");
		expect(resolveAnthropicCacheScope({ scope: "last_user_message" })).toBe("last_user_message");
		expect(resolveAnthropicCacheScope({ scope: "none" })).toBe("none");
		expect(resolveAnthropicCacheScope({ scope: "agent" })).toBe("agent");
		expect(resolveAnthropicCacheScope({ scope: "conversation" })).toBe("agent");
		expect(resolveAnthropicCacheScope({ scope: "every_message" })).toBe("agent");
	});

	it("agent marks tools, system, the final tool results, and the previous step", () => {
		const request = buildToolLoopRequest(10);
		request.anthropicCacheControl = { ...AGENT_CACHE, ttl: "5m" };

		const payload = irToAnthropicMessages(request);
		const last = payload.messages.length - 1;
		expect(payload.messages[last].content.map((block: any) => block.type)).toEqual(["tool_result"]);
		expect(listBreakpoints(payload)).toEqual([
			"tools[39]",
			"system[0]",
			`messages[${last - 2}].tool_result[0]`,
			`messages[${last}].tool_result[0]`,
		]);
		expect(payload.messages[last].content[0].cache_control).toEqual({ type: "ephemeral", ttl: "5m" });
	});

	it("agent keeps the previous request's final breakpoint as a read point", () => {
		const shorter = irToAnthropicMessages({ ...buildToolLoopRequest(3), anthropicCacheControl: { ...AGENT_CACHE } });
		const longer = irToAnthropicMessages({ ...buildToolLoopRequest(4), anthropicCacheControl: { ...AGENT_CACHE } });
		const shorterLast = shorter.messages.length - 1;
		expect(listBreakpoints(shorter)).toContain(`messages[${shorterLast}].tool_result[0]`);
		expect(listBreakpoints(longer)).toContain(`messages[${shorterLast}].tool_result[0]`);
		expect(listBreakpoints(longer)).toContain(`messages[${longer.messages.length - 1}].tool_result[0]`);
	});

	it("treats conversation and unknown scopes like agent", () => {
		const agent = listBreakpoints(irToAnthropicMessages({ ...buildToolLoopRequest(10), anthropicCacheControl: { ...AGENT_CACHE } }));
		const alias = listBreakpoints(irToAnthropicMessages({
			...buildToolLoopRequest(10),
			anthropicCacheControl: { type: "ephemeral", scope: "conversation" },
		}));
		const unknown = listBreakpoints(irToAnthropicMessages({
			...buildToolLoopRequest(10),
			anthropicCacheControl: { type: "ephemeral", scope: "every_user_message" },
		}));
		expect(alias).toEqual(agent);
		expect(unknown).toEqual(agent);
		expect(unknown.length).toBeLessThanOrEqual(ANTHROPIC_MAX_CACHE_BREAKPOINTS);
	});

	it("agent treats parallel tool results as one turn", () => {
		const request = buildToolLoopRequest(2);
		// Chat Completions sends one tool message per call; Anthropic merges them.
		request.messages.push(
			{
				role: "assistant",
				content: [],
				toolCalls: [
					{ id: "toolu_a", name: "read_file", arguments: "{}" },
					{ id: "toolu_b", name: "read_file", arguments: "{}" },
				],
			} as any,
			{ role: "tool", toolResults: [{ toolCallId: "toolu_a", content: "a" }] } as any,
			{ role: "tool", toolResults: [{ toolCallId: "toolu_b", content: "b" }] } as any,
		);
		request.anthropicCacheControl = { ...AGENT_CACHE };

		const payload = irToAnthropicMessages(request);
		const last = payload.messages.length - 1;
		expect(listBreakpoints(payload)).toEqual([
			"tools[39]",
			"system[0]",
			// The previous step's tool result, not the sibling result at last - 1.
			`messages[${last - 3}].tool_result[0]`,
			`messages[${last}].tool_result[0]`,
		]);
	});

	it("agent marks a plain user turn and copies provider blocks", () => {
		const thinking = { type: "thinking", thinking: "", signature: "sig" };
		const request: IRChatRequest = {
			...createBaseRequest(),
			messages: [
				{ role: "user", content: [{ type: "text", text: "First question" }] },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "First answer" },
						{ type: "provider_block", block: thinking },
					],
				},
				{ role: "user", content: [{ type: "text", text: "Second question" }] },
			] as any,
			anthropicCacheControl: { ...AGENT_CACHE },
		};

		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual(["messages[0].text[0]", "messages[2].text[0]"]);
		expect(payload.messages[1].content[1]).toEqual(thinking);
		expect(payload.messages[1].content[1]).not.toBe(thinking);
	});

	it("agent never marks a thinking block even when it ends the final turn", () => {
		const thinking = { type: "thinking", thinking: "", signature: "sig" };
		const request: IRChatRequest = {
			...createBaseRequest(),
			messages: [
				{ role: "user", content: [{ type: "text", text: "Question" }] },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Partial answer" },
						{ type: "provider_block", block: thinking },
					],
				},
			] as any,
			anthropicCacheControl: { ...AGENT_CACHE },
		};

		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual(["messages[1].text[0]"]);
		expect((thinking as any).cache_control).toBeUndefined();
	});

	it("agent skips deferred tools when choosing the tool breakpoint", () => {
		const request = buildToolLoopRequest(1, { toolCount: 2 });
		(request.tools as any[]).push({
			type: "web_fetch_20260209",
			name: "web_fetch",
			raw: { defer_loading: true },
		});
		request.anthropicCacheControl = { ...AGENT_CACHE };

		const payload = irToAnthropicMessages(request);
		expect(payload.tools[2].defer_loading).toBe(true);
		expect(payload.tools[2].cache_control).toBeUndefined();
		expect(payload.tools[1].cache_control).toEqual({ type: "ephemeral" });
	});

	it("counts caller-provided marks toward the cap under agent", () => {
		const request = buildToolLoopRequest(10);
		request.messages[0] = {
			role: "system",
			content: [{ type: "text", text: "You are a coding agent.", cacheControl: { type: "ephemeral", ttl: "1h" } }],
		} as any;
		(request.tools as any[])[0].cacheControl = { type: "ephemeral", ttl: "1h" };
		(request.messages[3] as any).toolResults[0].cacheControl = { type: "ephemeral", ttl: "1h" };
		request.anthropicCacheControl = { ...AGENT_CACHE };

		const payload = irToAnthropicMessages(request);
		const last = payload.messages.length - 1;
		expect(countAnthropicCacheBreakpoints(payload)).toBe(ANTHROPIC_MAX_CACHE_BREAKPOINTS);
		// Three caller marks leave room for the final turn only.
		expect(listBreakpoints(payload)).toEqual([
			"tools[0]",
			"system[0]",
			"messages[2].tool_result[0]",
			`messages[${last}].tool_result[0]`,
		]);
	});

	it("adds nothing when the caller already used every breakpoint", () => {
		const request = buildToolLoopRequest(10);
		for (const index of [0, 1, 2, 3]) {
			(request.tools as any[])[index].cacheControl = { type: "ephemeral" };
		}
		request.anthropicCacheControl = { ...AGENT_CACHE };

		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual(["tools[0]", "tools[1]", "tools[2]", "tools[3]"]);
		expect(payload.system).toBe("You are a coding agent.");
	});

	it("all_text marks the system prompt and only the last three user text messages", () => {
		const request: IRChatRequest = {
			...createBaseRequest(),
			messages: [
				{ role: "system", content: [{ type: "text", text: "System" }] },
				...Array.from({ length: 6 }, (_, index) => [
					{ role: "user", content: [{ type: "text", text: `Question ${index}` }] },
					{ role: "assistant", content: [{ type: "text", text: `Answer ${index}` }] },
				]).flat(),
				{ role: "user", content: [{ type: "text", text: "Last question" }] },
			] as any,
			anthropicCacheControl: { type: "ephemeral", scope: "all_text" },
		};

		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual([
			"system[0]",
			"messages[8].text[0]",
			"messages[10].text[0]",
			"messages[12].text[0]",
		]);
	});

	it("all_text without a scope keeps the default and marks one block per message", () => {
		const request: IRChatRequest = {
			...createBaseRequest(),
			messages: Array.from({ length: 6 }, (_, index) => ({
				role: "user",
				content: [{ type: "text", text: `Part ${index}` }, { type: "text", text: `More ${index}` }],
			})) as any,
			anthropicCacheControl: { type: "ephemeral" },
		};

		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual([
			"messages[3].text[1]",
			"messages[4].text[1]",
			"messages[5].text[1]",
		]);
	});

	it("all_text counts caller marks and skips tool-result-only turns", () => {
		const request = buildToolLoopRequest(10);
		(request.tools as any[])[0].cacheControl = { type: "ephemeral" };
		(request.tools as any[])[1].cacheControl = { type: "ephemeral" };
		request.anthropicCacheControl = { type: "ephemeral", scope: "all_text" };

		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual([
			"tools[0]",
			"tools[1]",
			"system[0]",
			"messages[0].text[0]",
		]);
	});

	it("last_user_message is unchanged for tool-result-only turns and marks one block", () => {
		const loop = buildToolLoopRequest(10);
		loop.anthropicCacheControl = { type: "ephemeral", scope: "last_user_message" };
		expect(listBreakpoints(irToAnthropicMessages(loop))).toEqual([]);

		const request: IRChatRequest = {
			...createBaseRequest(),
			messages: [
				{ role: "system", content: [{ type: "text", text: "System" }] },
				{
					role: "user",
					content: Array.from({ length: 6 }, (_, index) => ({ type: "text", text: `Part ${index}` })),
				},
			] as any,
			anthropicCacheControl: { type: "ephemeral", scope: "last_user_message" },
		};
		const payload = irToAnthropicMessages(request);
		expect(listBreakpoints(payload)).toEqual(["messages[0].text[5]"]);
		expect(payload.system).toBe("System");
	});

	it("none adds no breakpoints", () => {
		const request = buildToolLoopRequest(10);
		request.anthropicCacheControl = { type: "ephemeral", scope: "none" };
		expect(listBreakpoints(irToAnthropicMessages(request))).toEqual([]);
	});

	it("never exceeds the limit for long loops under any scope", () => {
		for (const scope of [undefined, "all_text", "last_user_message", "agent", "conversation", "bogus"]) {
			const request = buildToolLoopRequest(40);
			request.messages.push({ role: "user", content: [{ type: "text", text: "Keep going" }] } as any);
			request.anthropicCacheControl = scope ? { type: "ephemeral", scope } : { type: "ephemeral" };
			const payload = irToAnthropicMessages(request);
			expect(countAnthropicCacheBreakpoints(payload)).toBeLessThanOrEqual(ANTHROPIC_MAX_CACHE_BREAKPOINTS);
		}
	});

	it("decodes the desktop Responses opt-in through to the Anthropic payload", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "anthropic/claude-opus-5.5",
			stream: true,
			instructions: "You are a coding agent.",
			prompt_cache_key: "desktop-thread-123",
			provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } },
			tools: [
				{ type: "function", name: "read_file", parameters: { type: "object", properties: {} } },
				{ type: "function", name: "write_file", parameters: { type: "object", properties: {} } },
			],
			input: [
				{ role: "user", content: "Fix the failing test." },
				{ type: "function_call", call_id: "call_1", name: "read_file", arguments: "{}" },
				{ type: "function_call_output", call_id: "call_1", output: "file contents" },
				{ type: "function_call", call_id: "call_2", name: "read_file", arguments: "{}" },
				{ type: "function_call_output", call_id: "call_2", output: "more contents" },
			],
		} as any);
		expect(ir.anthropicCacheControl).toEqual({ type: "ephemeral", scope: "agent" });
		expect(ir.promptCacheKey).toBe("desktop-thread-123");

		const payload = irToAnthropicMessages(ir, null, "claude-opus-5-5");
		const last = payload.messages.length - 1;
		expect(listBreakpoints(payload)).toEqual([
			"tools[1]",
			"system[0]",
			`messages[${last - 2}].tool_result[0]`,
			`messages[${last}].tool_result[0]`,
		]);
		expect(payload.messages[last].content[0].cache_control).toEqual({ type: "ephemeral" });
		// prompt_cache_key only drives sticky routing; it is never sent to Anthropic.
		expect(payload).not.toHaveProperty("prompt_cache_key");
		expect(JSON.stringify(payload)).not.toContain("\"scope\"");
	});

	it("decodes the desktop Chat Completions opt-in through to the Anthropic payload", () => {
		const ir = decodeOpenAIChatRequest({
			model: "anthropic/claude-opus-5.5",
			stream: true,
			prompt_cache_key: "desktop-thread-123",
			provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } },
			tools: [
				{ type: "function", function: { name: "read_file", parameters: { type: "object", properties: {} } } },
			],
			messages: [
				{ role: "system", content: "You are a coding agent." },
				{ role: "user", content: "Fix the failing test." },
				{
					role: "assistant",
					content: null,
					tool_calls: [{ id: "call_1", type: "function", function: { name: "read_file", arguments: "{}" } }],
				},
				{ role: "tool", tool_call_id: "call_1", content: "file contents" },
			],
		} as any);
		expect(ir.anthropicCacheControl).toEqual({ type: "ephemeral", scope: "agent" });
		expect(ir.promptCacheKey).toBe("desktop-thread-123");

		const payload = irToAnthropicMessages(ir, null, "claude-opus-5-5");
		expect(listBreakpoints(payload)).toEqual([
			"tools[0]",
			"system[0]",
			"messages[0].text[0]",
			"messages[2].tool_result[0]",
		]);
		expect(payload).not.toHaveProperty("prompt_cache_key");
	});
});
