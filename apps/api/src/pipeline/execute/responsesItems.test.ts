import { describe, expect, it } from "vitest";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { normalizeIRForProvider } from "./normalize";
import { droppedParamsForClient, recordDroppedParams, type DroppedParam } from "./unsupportedParams";

// A Codex-style turn: hosted search, a local shell call and its output, an
// apply_patch call, then a function call; plus MCP, computer use, compaction
// and an item reference. https://platform.openai.com/docs/api-reference/responses/create
const input = [
	{ type: "message", role: "user", content: [{ type: "input_text", text: "Fix the build" }] },
	{ type: "compaction", id: "cmp_1", encrypted_content: "enc" },
	{ type: "web_search_call", id: "ws_1", status: "completed", action: { type: "search", query: "error" } },
	{ type: "shell_call", id: "sh_1", call_id: "call_sh", action: { commands: ["npm test"] }, status: "completed" },
	{ type: "shell_call_output", call_id: "call_sh", output: [{ stdout: "1 failed", stderr: "", outcome: { type: "exit", exit_code: 1 } }] },
	{ type: "local_shell_call", id: "ls_1", call_id: "call_ls", action: { type: "exec", command: ["ls"] }, status: "completed" },
	{ type: "local_shell_call_output", id: "lso_1", call_id: "call_ls", output: "src" },
	{ type: "apply_patch_call", id: "ap_1", call_id: "call_ap", operation: { type: "update_file", path: "a.ts", diff: "-a\n+b" }, status: "completed" },
	{ type: "apply_patch_call_output", call_id: "call_ap", status: "completed" },
	{ type: "computer_call", id: "cu_1", call_id: "call_cu", action: { type: "screenshot" }, pending_safety_checks: [], status: "completed" },
	{ type: "computer_call_output", call_id: "call_cu", output: { type: "computer_screenshot", image_url: "data:image/png;base64,AAAA" } },
	{ type: "mcp_list_tools", id: "mcpl_1", server_label: "docs", tools: [] },
	{ type: "mcp_approval_request", id: "mcpr_1", server_label: "docs", name: "search", arguments: "{}" },
	{ type: "mcp_approval_response", approval_request_id: "mcpr_1", approve: true },
	{ type: "mcp_call", id: "mcp_1", server_label: "docs", name: "search", arguments: "{}", output: "ok" },
	{ type: "item_reference", id: "msg_prev" },
	{ type: "function_call", call_id: "call_fn", name: "lookup", arguments: "{}" },
	{ type: "function_call_output", call_id: "call_fn", output: "found" },
];
const verbatimTypes = input.slice(1, 16).map((item) => item.type);

function decode() {
	return decodeOpenAIResponsesRequest({ model: "openai/gpt-5.4", input } as any);
}

describe("verbatim Responses input items", () => {
	it("reach OpenAI unchanged and in their original order", () => {
		const dropped: DroppedParam[] = [];
		const ir = normalizeIRForProvider(decode(), "openai", "openai.responses", {
			onDroppedParams: (entries) => dropped.push(...entries),
		});
		const request = irToOpenAIResponses(ir, "gpt-5.4", "openai");

		expect(dropped).toEqual([]);
		expect(request.input.map((item: any) => item.type)).toEqual([
			"message",
			...verbatimTypes,
			"function_call",
			"function_call_output",
		]);
		for (const original of input.slice(1, 16)) {
			expect(request.input).toContainEqual(original);
		}
	});

	it("are removed for other providers and reported as dropped, once per type", () => {
		const dropped: DroppedParam[] = [];
		const ir = normalizeIRForProvider(decode(), "anthropic", "openai.responses", {
			onDroppedParams: (entries) => dropped.push(...entries),
		});

		expect(ir.messages.some((message) => message.role !== "tool"
			&& message.content.some((part) => part.type === "responses_item"))).toBe(false);
		expect(ir.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"]);
		expect(dropped.map((entry) => entry.param)).toEqual(verbatimTypes.map((type) => `input.${type}`));
		expect(dropped[0]).toEqual({
			param: "input.compaction",
			reason: "unsupported_by_provider",
			source: "provider_api",
			clientSent: true,
		});

		const ctx: any = { endpoint: "responses", requestedParams: ["input"], routingDiagnostics: null };
		recordDroppedParams(ctx, "anthropic", dropped);
		expect(droppedParamsForClient(ctx).map((entry) => entry.param)).toContain("input.shell_call");
		expect(ctx.routingDiagnostics.droppedParams.params[0]).not.toHaveProperty("clientSent");
	});

	it("keeps a reasoning item ahead of the hosted call it precedes", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "openai/gpt-5.4",
			input: [
				{ type: "message", role: "user", content: "search" },
				{ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc_rs" },
				{ type: "web_search_call", id: "ws_1", status: "completed", action: { type: "search", query: "q" } },
				{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Found it." }] },
			],
		} as any);
		const request = irToOpenAIResponses(ir, "gpt-5.4", "openai");
		expect(request.input.map((item: any) => item.type)).toEqual(["message", "reasoning", "web_search_call", "message"]);
	});
});
