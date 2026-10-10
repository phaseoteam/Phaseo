// Purpose: Provider-doc compatibility checks for request parameters.
// Why: Reject documented model constraints without silently changing semantics.
// How: Keep existing advisory behavior except for explicit model contracts.

import type { Endpoint } from "@core/types";
import type { ProviderCandidate } from "./types";
import { isClaudeOpus55 } from "@core/claudeModelCapabilities";
import { claudeRequestIssues } from "@core/claudeRequestValidation";
import { decodeProtocol } from "@protocols/index";
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
	if (isClaudeOpus55(args.model) && ["messages", "responses", "chat.completions"].includes(args.endpoint)) {
		const protocol = args.endpoint === "messages" ? "anthropic.messages" : args.endpoint === "responses" ? "openai.responses" : "openai.chat.completions";
		const ir = decodeProtocol(protocol, args.body);
		const failures = args.providers.map(provider => ({
			provider, issues: claudeRequestIssues(ir, args.model, provider.providerId),
		}));
		const compatible = failures.filter(row => row.issues.length === 0);
		if (compatible.length) return { ok: true, providers: compatible.map(row => row.provider), body: args.body };
		if (failures.length) return { ok: false, response: err("validation_error", {
			description: failures[0].issues[0].message,
			details: failures.flatMap(row => row.issues.map(issue => ({ path: [issue.field], message: issue.message, keyword: "unsupported_model_option", params: { provider: row.provider.providerId } }))),
			request_id: args.requestId, workspace_id: args.workspaceId,
		}) };
	}
	return { ok: true, providers: args.providers, body: args.body };
}
