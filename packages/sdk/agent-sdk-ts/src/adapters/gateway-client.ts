import Phaseo, { type PhaseoOptions, type ResponsesRequest, type ResponsesResponse } from "@phaseo/sdk";
import { AgentGatewayError } from "../errors.js";
import { normalizeAgentItems } from "../items.js";
import type { AgentMessage, AgentModelClient, AgentModelRequest, AgentToolCall } from "../types.js";

export type GatewayAgentClientOptions = {
	client?: Phaseo;
	clientOptions?: PhaseoOptions;
	model?: string;
	preset?: string;
	provider?: ResponsesRequest["provider"];
	reasoning?: ResponsesRequest["reasoning"];
	temperature?: number;
	maxOutputTokens?: number;
	parallelToolCalls?: boolean;
	metadata?: Record<string, string>;
	user?: string;
	responseFormat?: ResponsesRequest["response_format"];
	includeMeta?: boolean;
	webSearchOptions?: ResponsesRequest["web_search_options"];
	plugins?: ResponsesRequest["plugins"];
	gatewayTools?: ResponsesRequest["tools"];
	toolChoice?: ResponsesRequest["tool_choice"];
	providerOptions?: ResponsesRequest["provider_options"];
	promptCacheKey?: ResponsesRequest["prompt_cache_key"];
	/** Additional Responses API fields. Agent-owned model, input, instructions, and tools take precedence. */
	requestOptions?: Partial<ResponsesRequest>;
};

function coerceTextContent(content: string): string {
	return typeof content === "string" ? content : String(content ?? "");
}

function toPresetModelAlias(preset: string | undefined): string | undefined {
	if (typeof preset !== "string") return undefined;
	const normalized = preset.trim().replace(/^@+/, "");
	return normalized.length > 0 ? `@${normalized}` : undefined;
}

function toResponsesInput(messages: AgentMessage[]) {
	return messages.flatMap((message) => {
		if (message.role === "system") return [];
		if (message.role === "tool") {
			return [{
				type: "function_call_output",
				call_id: message.toolCallId,
				output: coerceTextContent(message.content),
			}];
		}

		const baseMessage = {
			type: "message",
			role: message.role,
			content: coerceTextContent(message.content),
		} as Record<string, unknown>;

		if (
			message.role === "assistant" &&
			Array.isArray(message.toolCalls) &&
			message.toolCalls.length > 0
		) {
			baseMessage.tool_calls = message.toolCalls.map((toolCall) => ({
				id: toolCall.id,
				type: "function",
				function: {
					name: toolCall.name,
					arguments: JSON.stringify(toolCall.input ?? {}),
				},
			}));
		}

		return [baseMessage];
	});
}

function toInstructions(messages: AgentMessage[], override?: string) {
	const systemText = messages
		.filter((message) => message.role === "system")
		.map((message) => coerceTextContent(message.content))
		.filter((value) => value.trim().length > 0)
		.join("\n\n");

	if (override && systemText) return `${override}\n\n${systemText}`;
	return (override ?? systemText) || undefined;
}

function buildFunctionTools(request: AgentModelRequest<any>) {
	return request.tools.map((tool) => ({
		type: "function" as const,
		function: {
			name: tool.id,
			description: tool.description,
			parameters:
				tool.parameters && typeof tool.parameters === "object"
					? tool.parameters
					: {
						type: "object",
						additionalProperties: true,
					},
		},
	}));
}

function buildRequestTools(
	request: AgentModelRequest<any>,
	extraTools?: ResponsesRequest["tools"],
): ResponsesRequest["tools"] | undefined {
	const functionTools = buildFunctionTools(request);
	const nativeTools = Array.isArray(extraTools) ? extraTools : [];
	const mergedTools = [...functionTools, ...nativeTools];
	return mergedTools.length > 0 ? mergedTools : undefined;
}

function safeParseToolInput(raw: string | undefined) {
	if (!raw) return {};
	try {
		return JSON.parse(raw);
	} catch {
		return { raw };
	}
}

function extractToolCalls(response: ResponsesResponse): AgentToolCall[] | undefined {
	const items = Array.isArray(response.output_items)
		? response.output_items
		: Array.isArray(response.output)
			? response.output
			: [];

	const toolCalls = items
		.filter((item) => String(item?.type ?? "").toLowerCase() === "function_call")
		.map((item, index) => ({
			id: item.call_id ?? `tool_call_${index}`,
			name: item.name ?? "tool",
			input: safeParseToolInput(item.arguments),
		}));

	return toolCalls.length > 0 ? toolCalls : undefined;
}

function extractAssistantText(response: ResponsesResponse): string {
	const items = Array.isArray(response.output_items)
		? response.output_items
		: Array.isArray(response.output)
			? response.output
			: [];

	const textParts: string[] = [];
	for (const item of items) {
		if (String(item?.type ?? "").toLowerCase() !== "message") continue;
		const content = Array.isArray(item.content) ? item.content : [];
		for (const part of content) {
			if (String(part?.type ?? "").toLowerCase() === "output_text" && typeof part.text === "string") {
				textParts.push(part.text);
			}
		}
	}

	return textParts.join("\n\n");
}

function isAsyncIterableResponse(
	value: ResponsesResponse | AsyncGenerator<string>,
): value is AsyncGenerator<string> {
	return Symbol.asyncIterator in Object(value as object);
}

function extractResponseMeta(response: ResponsesResponse): Record<string, unknown> | undefined {
	const meta = (response as Record<string, unknown>).meta;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
	return meta as Record<string, unknown>;
}

function toAgentModelResponse(response: ResponsesResponse): import("../types.js").AgentModelResponse {
	const rawItems = Array.isArray(response.output_items)
		? response.output_items
		: Array.isArray(response.output)
			? response.output
			: [];
	const raw = response as Record<string, any>;
	const usage = response.usage as Record<string, any> | undefined;
	const meta = extractResponseMeta(response) as Record<string, any> | undefined;
	const directCost = [raw.cost, raw.cost_usd, usage?.cost, meta?.cost, meta?.cost_usd].find((value) => typeof value === "number");
	const costNanos = typeof raw.cost_nanos === "number" ? raw.cost_nanos : meta?.cost_nanos;
	const cost = directCost ?? (typeof costNanos === "number" ? costNanos / 1_000_000_000 : undefined);
	return {
		message: { role: "assistant", content: extractAssistantText(response), toolCalls: extractToolCalls(response) },
		items: rawItems.flatMap(normalizeAgentItems),
		usage: response.usage as Record<string, unknown> | undefined,
		requestId: response.id,
		nativeResponseId: (response as Record<string, any>).nativeResponseId ?? (response as Record<string, any>).native_response_id ?? null,
		provider: (response as Record<string, any>).provider,
		model: response.model,
		finishReason: raw.finish_reason ?? raw.stop_reason ?? raw.status,
		cost,
		warnings: Array.isArray(raw.warnings) ? raw.warnings : undefined,
		responseMeta: meta,
	};
}

function buildPayload(request: AgentModelRequest<any>, options: GatewayAgentClientOptions, stream = false): ResponsesRequest & { meta?: boolean } {
	return {
		...options.requestOptions,
		model: request.model ?? options.model ?? toPresetModelAlias(options.preset) ?? "phaseo/free",
		input: toResponsesInput(request.messages),
		instructions: toInstructions(request.messages, request.instructions),
		tools: buildRequestTools(request, options.gatewayTools),
		tool_choice: options.toolChoice,
		parallel_tool_calls: options.parallelToolCalls,
		temperature: request.temperature ?? options.temperature,
		max_output_tokens: request.maxOutputTokens ?? options.maxOutputTokens,
		top_p: request.topP ?? options.requestOptions?.top_p,
		provider: options.provider,
		reasoning: options.reasoning,
		metadata: options.metadata,
		meta: options.includeMeta,
		user: options.user,
		response_format: options.responseFormat,
		web_search_options: options.webSearchOptions,
		plugins: options.plugins,
		provider_options: options.providerOptions,
		prompt_cache_key: options.promptCacheKey,
		stream,
	};
}

export function createGatewayAgentClient(
	options: GatewayAgentClientOptions = {},
): AgentModelClient {
	const client = options.client ?? new Phaseo({
		...(options.clientOptions ?? {}),
		headers: {
			...(options.clientOptions?.headers ?? {}),
			"X-Phaseo-Client": "phaseo-agent-typescript",
			"X-Phaseo-Client-Version": "0.3.0",
		},
	});

	return {
		async generate(request) {
			let response: ResponsesResponse | AsyncGenerator<string>;
			try {
				const requestPayload = buildPayload(request, options, false);
				response = request.signal
					? await client.responses.create(requestPayload, { signal: request.signal })
					: await client.responses.create(requestPayload);
			} catch (error) {
				throw AgentGatewayError.fromUnknown(error) ?? error;
			}

			if (isAsyncIterableResponse(response)) {
				throw new Error("Streaming agent client responses are not supported in the basic gateway adapter");
			}

			return toAgentModelResponse(response);
		},
		async *stream(request) {
			let response: ResponsesResponse | AsyncGenerator<any>;
			try {
				const payload = buildPayload(request, options, true);
				response = request.signal
					? await client.responses.create(payload, { signal: request.signal })
					: await client.responses.create(payload);
			}
			catch (error) { throw AgentGatewayError.fromUnknown(error) ?? error; }
			if (!isAsyncIterableResponse(response as any)) {
				yield { type: "response.completed" as const, response: toAgentModelResponse(response as ResponsesResponse) };
				return;
			}
			let text = "";
			for await (const chunk of response as AsyncGenerator<Record<string, unknown>>) {
				const eventType = String(chunk.type ?? "");
				const delta = typeof chunk.delta === "string" ? chunk.delta : typeof chunk.text === "string" ? chunk.text : "";
				if (eventType.includes("reasoning") && delta) yield { type: "response.reasoning.delta" as const, delta, raw: chunk };
				else if ((eventType.includes("output_text.delta") || delta) && delta) { text += delta; yield { type: "response.output_text.delta" as const, delta, raw: chunk }; }
				if (chunk.item) {
					for (const item of normalizeAgentItems(chunk.item)) {
						yield { type: "response.item" as const, item, raw: chunk };
					}
				}
				if (eventType === "response.completed") {
					const rawResponse = (chunk.response ?? chunk) as ResponsesResponse;
					yield { type: "response.completed" as const, response: toAgentModelResponse(rawResponse), raw: chunk };
					return;
				}
			}
			yield { type: "response.completed" as const, response: { message: { role: "assistant", content: text } } };
		},
	};
}
