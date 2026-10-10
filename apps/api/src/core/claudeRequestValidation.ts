import type { IRChatRequest } from "./ir";
import { isClaudeOpus55 } from "./claudeModelCapabilities";

export type ClaudeRequestIssue = { field: string; message: string };

// These constraints are model contracts, independent of the incoming wire format.
export function claudeRequestIssues(ir: IRChatRequest, model: string, providerId?: string): ClaudeRequestIssue[] {
	if (!isClaudeOpus55(model)) return [];
	const issues: ClaudeRequestIssue[] = [];
	const add = (field: string, message: string) => issues.push({ field, message: `Opus 5.5: ${message}` });
	for (const [field, value] of [["temperature", ir.temperature], ["top_p", ir.topP], ["top_k", ir.topK]] as const) {
		if (value !== undefined) add(field, `omit ${field}; sampling controls are not supported.`);
	}
	if (ir.reasoning?.enabled === false || ir.reasoning?.effort === "none") {
		add("thinking", "thinking cannot be disabled; choose a supported reasoning effort instead.");
	}
	if (ir.reasoning?.maxTokens !== undefined) {
		add("thinking", "thinking token budgets are not supported; choose a reasoning effort instead.");
	}
	if (ir.toolChoice === "required" || (ir.toolChoice && typeof ir.toolChoice === "object")) {
		add("tool_choice", "forced tool choice is not supported; use auto or none.");
	}
	if (ir.messages.at(-1)?.role === "assistant") {
		add("messages", "assistant prefill is not supported; end the conversation with a user message or tool result.");
	}
	if (providerId === "amazon-bedrock") {
		if ((ir.responseFormat && ir.responseFormat.type !== "text") || ir.rawRequest?.structured_outputs === true) {
			add("response_format", "structured outputs are not supported on Bedrock.");
		}
		if (ir.tools?.some(tool => tool.strict === true || tool.raw?.strict === true)) {
			add("tools", "strict tool use is not supported on Bedrock.");
		}
	}
	return issues;
}

export function assertClaudeRequestSupported(ir: IRChatRequest, model: string, providerId?: string): void {
	const issue = claudeRequestIssues(ir, model, providerId)[0];
	if (issue) throw new Error(`${issue.field}: ${issue.message}`);
}
