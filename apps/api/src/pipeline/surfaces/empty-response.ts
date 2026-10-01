import type { IRChatResponse } from "@core/ir";

export type EmptyResponseReason = "no_choices" | "reasoning_only" | "no_visible_output";

export type EmptyResponseDiagnostics = {
	reason: EmptyResponseReason;
	choice_count: number;
	content_part_types: string[];
	finish_reasons: Array<string | null>;
	reasoning_part_count: number;
	reasoning_character_count: number;
	visible_part_count: number;
	tool_call_count: number;
	usage: {
		output_tokens: number;
		reasoning_tokens: number | null;
		total_tokens: number;
	} | null;
};

export function hasUsableIRChatResponse(response: IRChatResponse | undefined): boolean {
	if (!response?.choices?.length) return false;
	return response.choices.some((choice) => {
		if (choice.message?.refusal?.trim()) return true;
		if ((choice.message?.toolCalls?.length ?? 0) > 0) return true;
		return (choice.message?.content ?? []).some((part) => {
			if (part.type === "text" || part.type === "reasoning_text") return part.text.trim().length > 0;
			return part.type === "image" || part.type === "audio" || part.type === "video";
		});
	});
}

export function buildEmptyResponseDiagnostics(
	response: IRChatResponse | undefined,
): EmptyResponseDiagnostics {
	const choices = response?.choices ?? [];
	const contentPartTypes = new Set<string>();
	const finishReasons = new Set<string | null>();
	let reasoningPartCount = 0;
	let reasoningCharacterCount = 0;
	let visiblePartCount = 0;
	let toolCallCount = 0;

	for (const choice of choices) {
		finishReasons.add(choice.finishReason ?? null);
		toolCallCount += choice.message?.toolCalls?.length ?? 0;
		for (const part of choice.message?.content ?? []) {
			contentPartTypes.add(part.type);
			if (part.type === "reasoning_text") {
				reasoningPartCount += 1;
				reasoningCharacterCount += part.text.length;
				continue;
			}
			if (part.type === "text") {
				if (part.text.trim()) visiblePartCount += 1;
				continue;
			}
			if (part.type === "image" || part.type === "audio" || part.type === "video") {
				visiblePartCount += 1;
			}
		}
	}

	const reason: EmptyResponseReason = choices.length === 0
		? "no_choices"
		: reasoningPartCount > 0 && visiblePartCount === 0 && toolCallCount === 0
			? "reasoning_only"
			: "no_visible_output";
	const usage = response?.usage;

	return {
		reason,
		choice_count: choices.length,
		content_part_types: [...contentPartTypes].sort(),
		finish_reasons: [...finishReasons],
		reasoning_part_count: reasoningPartCount,
		reasoning_character_count: reasoningCharacterCount,
		visible_part_count: visiblePartCount,
		tool_call_count: toolCallCount,
		usage: usage
			? {
				output_tokens: usage.outputTokens,
				reasoning_tokens: usage.reasoningTokens ?? null,
				total_tokens: usage.totalTokens,
			}
			: null,
	};
}

export function emptyResponseMessage(diagnostics: EmptyResponseDiagnostics): string {
	if (diagnostics.reason === "reasoning_only") {
		return "The provider produced reasoning but no final answer. Increase max_tokens or lower the reasoning effort.";
	}
	return "The provider returned a successful response without any visible output.";
}
