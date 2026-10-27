// Purpose: Provider-doc compatibility checks for request parameters.
// Why: Reject documented model constraints without silently changing semantics.
// How: Keep existing advisory behavior except for explicit model contracts.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import { isClaudeOpus55, claudeModelWithoutForcedToolChoice } from "@core/claudeModelCapabilities";
import { claudeRequestIssues } from "@core/claudeRequestValidation";
import { decodeProtocol } from "@protocols/index";
import { dropVerbatimResponsesItems } from "@pipeline/execute/responsesItems";
import { forwardsOpenAIAllowedTools, resolveAllowedTools } from "@protocols/shared/text-normalizers";
import { err } from "./http";

type ValidationResult =
	| { ok: true; providers: ProviderCandidate[]; body: any }
	| { ok: false; response: Response };

export function validateProviderDocsCompliance(args: {
	endpoint: Endpoint;
	body: any;
	requestId: string;
	workspaceId: string;
	model: string;
	providers: ProviderCandidate[];
	requestedParams: string[];
}): ValidationResult {
	if ((isClaudeOpus55(args.model) || claudeModelWithoutForcedToolChoice(args.model)) && ["messages", "responses", "chat.completions"].includes(args.endpoint)) {
		const protocol = args.endpoint === "messages" ? "anthropic.messages" : args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions";
		const ir = decodeProtocol(protocol, args.body);
		const failures = args.providers.map(provider => ({
			// Checked as the provider will receive it, without input items only OpenAI takes.
			provider, issues: claudeRequestIssues(dropVerbatimResponsesItems(ir, provider.providerId).ir, args.model, provider.providerId),
		}));
		const compatible = failures.filter(row => row.issues.length === 0);
		if (compatible.length) return { ok: true, providers: compatible.map(row => row.provider), body: args.body };
		if (failures.length) return { ok: false, response: err("validation_error", {
			description: failures[0].issues[0].message,
			details: failures.flatMap(row => row.issues.map(issue => ({ path: [issue.field], message: issue.message, keyword: "unsupported_model_option", params: { provider: row.provider.providerId } }))),
			request_id: args.requestId, workspace_id: args.workspaceId,
		}) };
	}
	const allowedTools = unmatchedAllowedTools(args.endpoint, args.body);
	if (allowedTools.length > 0) {
		// Only OpenAI receives `allowed_tools` itself. Every other provider is sent just
		// the allowed tools, which cannot include one the request does not define.
		const providers = args.providers.filter(provider => forwardsOpenAIAllowedTools(provider.providerId));
		if (providers.length) return { ok: true, providers, body: args.body };
		const message = `tool_choice.allowed_tools lists ${allowedTools.map(name => `"${name}"`).join(", ")}, which ${allowedTools.length === 1 ? "is" : "are"} not in tools. List only tools the request defines.`;
		return { ok: false, response: err("validation_error", {
			description: message,
			details: [{ path: ["tool_choice"], message, keyword: "allowed_tools_not_defined", params: { tools: allowedTools } }],
			request_id: args.requestId, workspace_id: args.workspaceId,
		}) };
	}
	return { ok: true, providers: args.providers, body: args.body };
}

/** `allowed_tools` entries that name no tool in the request's `tools`. */
function unmatchedAllowedTools(endpoint: Endpoint, body: any): string[] {
	if (endpoint !== "chat.completions" && endpoint !== "responses") return [];
	if (body?.tool_choice?.type !== "allowed_tools") return [];
	const ir = decodeProtocol(endpoint === "responses" ? "openai.responses" : "openai.chat.completions", body);
	return resolveAllowedTools(body.tool_choice, ir.tools)?.unmatched ?? [];
}
