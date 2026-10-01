import {
	DEFAULT_SERVER_TOOLS,
	buildServerToolDefinitions,
	getEffectiveModelSettings,
	getRequestedChatServiceTier,
	shouldRequestImageModalities,
} from "@/components/(chat)/playground/chat-playground-core";
import { getInlineAttachmentPreviewsFromMeta } from "@/components/(chat)/chatConversationHelpers";
import type { ChatMessage, ChatThread } from "@/lib/indexeddb/chats";
import type { SdkRequest } from "@/lib/chat/sdkExport";

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function requestIdFromMessage(message: ChatMessage | undefined) {
	const variant = message?.variants?.[message.activeVariantIndex ?? 0];
	const meta = asRecord(variant?.meta) ?? asRecord(message?.meta);
	const value = meta?.request_id ?? meta?.requestId ?? meta?.generation_id ?? meta?.generationId;
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalNumber(body: Record<string, unknown>, key: string, value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) body[key] = value;
}

function persistedMessageContent(message: ChatMessage): unknown | null {
	if (message.role !== "user") return message.content;
	const messageContext = asRecord(asRecord(message.meta)?.request_context);
	const attachmentCount = typeof messageContext?.attachments_count === "number"
		? messageContext.attachments_count
		: 0;
	const attachments = getInlineAttachmentPreviewsFromMeta(message.meta);
	if (attachmentCount > attachments.length) return null;
	if (!attachments.length) return message.content;

	const content: Array<Record<string, unknown>> = [];
	if (!/^\[Attachments?\]/.test(message.content)) {
		content.push({ type: "input_text", text: message.content });
	}
	for (const attachment of attachments) {
		if (attachment.isImage) content.push({ type: "input_image", image_url: attachment.dataUrl });
		else if (attachment.isAudio) {
			content.push({
				type: "input_audio",
				input_audio: {
					data: attachment.dataUrl.includes(",") ? attachment.dataUrl.split(",")[1] ?? "" : attachment.dataUrl,
					format: attachment.mimeType?.split("/")[1]?.split(";")[0]?.trim() || "wav",
				},
			});
		} else if (attachment.isVideo) content.push({ type: "input_video", url: attachment.dataUrl });
	}
	return content;
}

export function sdkRequestFromTextThread(
	thread: ChatThread | null,
	baseUrl?: string,
): SdkRequest | null {
	if (!thread) return null;
	const latestUserIndex = thread.messages.findLastIndex((message) => message.role === "user");
	if (latestUserIndex < 0) return null;

	const latestUser = thread.messages[latestUserIndex];
	const context = asRecord(asRecord(latestUser.meta)?.request_context);
	const model = typeof context?.model_id === "string" && context.model_id.trim()
		? context.model_id.trim()
		: thread.modelId.trim();
	if (!model) return null;

	const settings = getEffectiveModelSettings(thread, model);
	const input: Array<{ role: "system" | "user" | "assistant"; content: unknown }> = [];
	for (const message of thread.messages.slice(0, latestUserIndex + 1)) {
		const content = persistedMessageContent(message);
		if (content === null) return null;
		input.push({ role: message.role, content });
	}
	const systemPrompt = settings.systemPrompt?.trim();
	if (systemPrompt) input.unshift({ role: "system", content: systemPrompt });

	const wantsImageModalities = Boolean(settings.imageOutputEnabled) || shouldRequestImageModalities(model);
	const body: Record<string, unknown> = {
		model,
		input,
		meta: true,
		stream: Boolean(settings.stream) && !wantsImageModalities,
		...(wantsImageModalities ? { modalities: ["text", "image"] } : {}),
	};
	optionalNumber(body, "temperature", settings.temperature);
	optionalNumber(body, "max_output_tokens", settings.maxOutputTokens);
	optionalNumber(body, "top_p", settings.topP);
	optionalNumber(body, "top_k", settings.topK);
	optionalNumber(body, "min_p", settings.minP);
	optionalNumber(body, "top_a", settings.topA);
	optionalNumber(body, "presence_penalty", settings.presencePenalty);
	optionalNumber(body, "frequency_penalty", settings.frequencyPenalty);
	optionalNumber(body, "repetition_penalty", settings.repetitionPenalty);
	optionalNumber(body, "seed", settings.seed);

	const serviceTier = getRequestedChatServiceTier(settings);
	if (serviceTier) body.service_tier = serviceTier;
	const providerId = settings.providerId?.trim();
	if (providerId && providerId !== "auto") body.provider = { only: [providerId] };

	const toolsEnabled = typeof context?.api_server_tools_enabled === "boolean"
		? context.api_server_tools_enabled
		: settings.apiServerToolsEnabled;
	if (toolsEnabled) {
		const tools = buildServerToolDefinitions(
			Array.isArray(context?.server_tools) ? context.server_tools as typeof settings.serverTools : settings.serverTools ?? DEFAULT_SERVER_TOOLS,
			asRecord(context?.server_tool_configs) as typeof settings.serverToolConfigs ?? settings.serverToolConfigs,
		);
		if (tools.length) body.tools = tools;
	}

	const reasoningEnabled = typeof context?.reasoning_enabled === "boolean"
		? context.reasoning_enabled
		: settings.reasoningEnabled;
	if (reasoningEnabled) {
		body.reasoning = {
			effort: typeof context?.reasoning_effort === "string"
				? context.reasoning_effort
				: settings.reasoningEffort ?? "medium",
		};
	}

	const response = thread.messages.slice(latestUserIndex + 1).find((message) => message.role === "assistant");
	const requestId = requestIdFromMessage(response);
	return {
		endpoint: "/responses",
		body,
		...(baseUrl ? { baseUrl } : {}),
		...(requestId ? { requestId } : {}),
	};
}
