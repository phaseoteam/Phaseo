// Purpose: Shared OpenAI-compatible text adapter and transformations.
// Why: Consolidates OpenAI-style quirks across many providers.
// How: Maps IR to OpenAI formats and normalizes streaming events.

import type { IRChatRequest, IRChatResponse } from "@core/ir";

export function irToOpenAICompletions(ir: IRChatRequest, model?: string | null): any {
	const prompt = buildPrompt(ir);
	const request: any = {
		model: model || ir.model,
		prompt,
	};

	if (ir.maxTokens !== undefined) request.max_tokens = ir.maxTokens;
	if (ir.temperature !== undefined) request.temperature = ir.temperature;
	if (ir.topP !== undefined) request.top_p = ir.topP;
	if (ir.stop) request.stop = ir.stop;
	if (ir.frequencyPenalty !== undefined) request.frequency_penalty = ir.frequencyPenalty;
	if (ir.presencePenalty !== undefined) request.presence_penalty = ir.presencePenalty;

	return request;
}

export function openAICompletionsToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const choices = (json.choices || []).map((choice: any) => ({
		index: choice.index || 0,
		message: {
			role: "assistant" as const,
			content: [{ type: "text", text: choice.text ?? "" }],
		},
		finishReason: mapFinishReason(choice.finish_reason),
		logprobs: choice.logprobs,
	}));

	return {
		id: requestId,
		nativeId: json.id,
		created: json.created || Math.floor(Date.now() / 1000),
		model,
		provider,
		choices,
		usage: json.usage
			? {
					inputTokens: json.usage.prompt_tokens || 0,
					outputTokens: json.usage.completion_tokens || 0,
					totalTokens: json.usage.total_tokens || 0,
			  }
			: undefined,
	};
}

function buildPrompt(ir: IRChatRequest): string {
	const lines: string[] = [];

	for (const msg of ir.messages) {
		if (msg.role === "tool") {
			const toolText = msg.toolResults
				.map((result) => result.content)
				.filter(Boolean)
				.join("\n");
			lines.push(`tool: ${toolText}`);
			continue;
		}

		const content = Array.isArray(msg.content)
			? msg.content.map((part) => (part.type === "text" ? part.text : "")).join("")
			: "";

		lines.push(`${msg.role}: ${content}`);
	}

	const lastRole = ir.messages.length ? ir.messages[ir.messages.length - 1].role : null;
	if (lastRole !== "assistant") {
		lines.push("assistant:");
	}

	return lines.join("\n");
}

function mapFinishReason(reason: string | undefined): any {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
		case "max_tokens":
			return "length";
		case "content_filter":
			return "content_filter";
		default:
			return "stop";
	}
}

