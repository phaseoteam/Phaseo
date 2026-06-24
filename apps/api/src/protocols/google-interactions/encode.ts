// Purpose: Protocol adapter for Google Interactions-compatible responses.
// Why: Lets shared text IR return a Google Interaction resource shape.
// How: Converts assistant content, thoughts, tool calls, and usage into steps.

import type { IRChatResponse, IRChoice, IRContentPart, IRUsage } from "@core/ir";

export type GoogleInteractionsResponse = {
	id: string;
	nativeResponseId?: string | null;
	gateway_id?: string;
	object: "interaction";
	created: number;
	model: string;
	status: "completed" | "failed" | "incomplete" | "requires_action";
	steps: any[];
	output_text?: string;
	usage?: {
		total_input_tokens: number;
		total_output_tokens: number;
		total_tokens: number;
		total_cached_tokens?: number;
		total_thought_tokens?: number;
		input_tokens_by_modality?: Array<{ modality: string; tokens: number }>;
		output_tokens_by_modality?: Array<{ modality: string; tokens: number }>;
	};
};

function audioMimeType(format?: Extract<IRContentPart, { type: "audio" }>["format"]): string {
	switch (format) {
		case "mp3":
			return "audio/mpeg";
		case "flac":
			return "audio/flac";
		case "m4a":
			return "audio/mp4";
		case "ogg":
			return "audio/ogg";
		case "pcm16":
			return "audio/L16";
		case "pcm24":
			return "audio/L24";
		case "wav":
		default:
			return "audio/wav";
	}
}

function parseArguments(value: string): Record<string, any> {
	if (!value) return {};
	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? parsed
			: { value: parsed };
	} catch {
		return { value };
	}
}

function contentPartToInteractionBlock(part: IRContentPart): any | null {
	if (part.type === "text") {
		return {
			type: "text",
			text: part.text,
		};
	}
	if (part.type === "image") {
		return part.source === "data"
			? {
				type: "image",
				mime_type: part.mimeType ?? "image/jpeg",
				data: part.data,
			}
			: {
				type: "image",
				mime_type: part.mimeType ?? "image/jpeg",
				uri: part.data,
			};
	}
	if (part.type === "audio") {
		const mimeType = audioMimeType(part.format);
		return part.source === "data"
			? {
				type: "audio",
				mime_type: mimeType,
				data: part.data,
			}
			: {
				type: "audio",
				mime_type: mimeType,
				uri: part.data,
			};
	}
	if (part.type === "video") {
		return {
			type: "video",
			uri: part.url,
		};
	}
	if (part.type === "provider_block") {
		return part.block;
	}
	return null;
}

function buildThoughtSteps(parts: IRContentPart[]): any[] {
	return parts
		.filter((part): part is Extract<IRContentPart, { type: "reasoning_text" }> => part.type === "reasoning_text")
		.map((part) => ({
			type: "thought",
			...(part.thoughtSignature ? { signature: part.thoughtSignature } : {}),
			summary: {
				type: "text",
				text: part.summary || part.text,
			},
		}));
}

function buildModelOutputStep(parts: IRContentPart[]): any | null {
	const content = parts
		.filter((part) => part.type !== "reasoning_text")
		.map(contentPartToInteractionBlock)
		.filter(Boolean);
	if (content.length === 0) return null;
	return {
		type: "model_output",
		content,
	};
}

function finishReasonToStatus(choice?: IRChoice): GoogleInteractionsResponse["status"] {
	if ((choice?.message.toolCalls?.length ?? 0) > 0 || choice?.finishReason === "tool_calls") {
		return "requires_action";
	}
	switch (choice?.finishReason) {
		case "error":
			return "failed";
		case "length":
			return "incomplete";
		default:
			return "completed";
	}
}

function modalityEntries(entries: Array<[string, number | undefined]>): Array<{ modality: string; tokens: number }> | undefined {
	const mapped = entries
		.filter(([, tokens]) => typeof tokens === "number" && Number.isFinite(tokens))
		.map(([modality, tokens]) => ({ modality, tokens: tokens as number }));
	return mapped.length > 0 ? mapped : undefined;
}

function encodeUsage(usage?: IRUsage): GoogleInteractionsResponse["usage"] | undefined {
	if (!usage) return undefined;
	const inputByModality = modalityEntries([
		["image", usage._ext?.inputImageTokens],
		["audio", usage._ext?.inputAudioTokens],
		["video", usage._ext?.inputVideoTokens],
	]);
	const outputByModality = modalityEntries([
		["image", usage._ext?.outputImageTokens],
		["audio", usage._ext?.outputAudioTokens],
		["video", usage._ext?.outputVideoTokens],
	]);

	return {
		total_input_tokens: usage.inputTokens ?? 0,
		total_output_tokens: usage.outputTokens ?? 0,
		total_tokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
		...(usage.cachedInputTokens != null ? { total_cached_tokens: usage.cachedInputTokens } : {}),
		...(usage.reasoningTokens != null ? { total_thought_tokens: usage.reasoningTokens } : {}),
		...(inputByModality ? { input_tokens_by_modality: inputByModality } : {}),
		...(outputByModality ? { output_tokens_by_modality: outputByModality } : {}),
	};
}

function collectOutputText(choices: IRChatResponse["choices"]): string | undefined {
	const text = choices
		.flatMap((choice) => choice.message.content)
		.filter((part): part is Extract<IRContentPart, { type: "text" }> => part.type === "text")
		.map((part) => part.text)
		.join("");
	return text.length > 0 ? text : undefined;
}

export function encodeGoogleInteractionsResponse(
	ir: IRChatResponse,
	requestId?: string,
): GoogleInteractionsResponse {
	const steps: any[] = [];

	for (const choice of ir.choices) {
		steps.push(...buildThoughtSteps(choice.message.content));
		const outputStep = buildModelOutputStep(choice.message.content);
		if (outputStep) steps.push(outputStep);
		for (const toolCall of choice.message.toolCalls ?? []) {
			steps.push({
				type: "function_call",
				id: toolCall.id,
				name: toolCall.name,
				arguments: parseArguments(toolCall.arguments),
			});
		}
	}

	const interactionId = ir.nativeId ?? ir.id ?? requestId ?? "";
	return {
		id: interactionId || requestId || "interaction",
		nativeResponseId: ir.nativeId ?? null,
		...(requestId ? { gateway_id: requestId } : {}),
		object: "interaction",
		created: ir.created ?? Math.floor(Date.now() / 1000),
		model: ir.model,
		status: finishReasonToStatus(ir.choices[0]),
		steps,
		output_text: collectOutputText(ir.choices),
		usage: encodeUsage(ir.usage),
	};
}
