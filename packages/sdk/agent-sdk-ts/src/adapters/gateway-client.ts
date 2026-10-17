import Phaseo, { type PhaseoOptions, type ResponsesRequest, type ResponsesResponse } from "@phaseo/sdk";
import { AgentGatewayError, AgentStreamError } from "../errors.js";
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
	/** Abandons a stream that sends nothing for this long, as a retryable error. Off by default. */
	streamIdleTimeoutMs?: number;
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
			content: message.role === "user" && Array.isArray(message.content) ? message.content.map(part => part.type === "text" ? { type: "input_text", text: part.text } : { type: "input_image", image_url: part.image_url.url }) : coerceTextContent(message.content as string),
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

function safeParseToolInput(raw: string | undefined): { input: unknown; inputError?: string } {
	if (!raw) return { input: {} };
	try {
		return { input: JSON.parse(raw) };
	} catch (error) {
		return { input: { raw }, inputError: error instanceof Error ? error.message : "invalid JSON" };
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
			...safeParseToolInput(item.arguments),
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

function errorText(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return value;
	if (!value || typeof value !== "object") return undefined;
	const record = value as Record<string, unknown>;
	return errorText(record.message) ?? errorText(record.error) ?? errorText(record.reason);
}

function streamFailure(value: unknown, code: string, retryable: boolean) {
	return new AgentStreamError(errorText(value) ?? "The model provider reported an error partway through the response.", { code, retryable });
}

/** A response the gateway ended as failed, incomplete or cancelled. Hitting the output limit is final; the rest may succeed on another attempt. */
function responseFailure(response: Record<string, unknown>, status: string) {
	const reason = errorText((response.incomplete_details as Record<string, unknown> | undefined)?.reason) ?? "";
	if (status === "incomplete" && /max_output_tokens|length/.test(reason)) return new AgentStreamError("The answer reached the model's output limit before it finished.", { code: "max_output_tokens", retryable: false });
	if (status === "incomplete" && /content_filter/.test(reason)) return new AgentStreamError("The model provider stopped the answer with its content filter.", { code: "content_filter", retryable: false });
	return streamFailure(response.error ?? (reason || undefined), `response_${status}`, status !== "cancelled");
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
			// A stall is told apart from the caller's own cancellation by which controller fired.
			const idle = new AbortController();
			const idleMs = options.streamIdleTimeoutMs;
			let timer: ReturnType<typeof setTimeout> | undefined;
			const arm = () => { if (!idleMs) return; clearTimeout(timer); timer = setTimeout(() => idle.abort(new AgentStreamError(`The model sent nothing for ${Math.round(idleMs / 1000)} seconds.`, { code: "stream_idle", retryable: true })), idleMs); };
			const signal = idleMs ? (request.signal ? AbortSignal.any([request.signal, idle.signal]) : idle.signal) : request.signal;
			const failure = (error: unknown) => idle.signal.aborted && !request.signal?.aborted ? idle.signal.reason : AgentGatewayError.fromUnknown(error) ?? error;
			arm();
			try {
				let response: ResponsesResponse | AsyncGenerator<any>;
				try {
					const payload = buildPayload(request, options, true);
					response = signal ? await client.responses.create(payload, { signal }) : await client.responses.create(payload);
				}
				catch (error) { throw failure(error); }
				if (!isAsyncIterableResponse(response as any)) {
					yield { type: "response.completed" as const, response: toAgentModelResponse(response as ResponsesResponse) };
					return;
				}
				const completedItems: unknown[] = [];
				// Output still arriving after the last finished item means the stream was cut off rather than completed.
				let text = "", unfinished = false;
				try {
					for await (const chunk of response as AsyncGenerator<Record<string, unknown>>) {
						arm();
						const eventType = String(chunk.type ?? "");
						if (eventType.endsWith(".delta")) unfinished = true;
						if (eventType === "response.output_item.done") unfinished = false;
						const delta = typeof chunk.delta === "string" ? chunk.delta : typeof chunk.text === "string" ? chunk.text : "";
						if (eventType === "error" || eventType === "response.error") throw streamFailure(chunk.error ?? chunk, "stream_error", true);
						if (eventType === "response.failed" || eventType === "response.incomplete" || eventType === "response.cancelled") throw responseFailure((chunk.response ?? chunk) as Record<string, unknown>, eventType.slice(9));
						if (eventType.includes("reasoning") && eventType.endsWith(".delta") && delta) yield { type: "response.reasoning.delta" as const, delta, raw: chunk };
						else if (eventType === "response.output_text.delta" && delta) { text += delta; yield { type: "response.output_text.delta" as const, delta, raw: chunk }; }
						if (chunk.item) {
							if (eventType === "response.output_item.done") completedItems.push(chunk.item);
							for (const item of normalizeAgentItems(chunk.item)) {
								yield { type: "response.item" as const, item, raw: chunk };
							}
						}
						if (eventType === "response.completed") {
							const rawResponse = (chunk.response ?? chunk) as ResponsesResponse;
							const status = String((rawResponse as Record<string, unknown>).status ?? "");
							if (["failed", "incomplete", "cancelled"].includes(status)) throw responseFailure(rawResponse as Record<string, unknown>, status);
							if (!Array.isArray(rawResponse.output_items) && !Array.isArray(rawResponse.output)) rawResponse.output = completedItems as ResponsesResponse["output"];
							yield { type: "response.completed" as const, response: toAgentModelResponse(rawResponse), raw: chunk };
							return;
						}
					}
				} catch (error) {
					if (error instanceof AgentStreamError) throw error;
					const mapped = failure(error);
					// fetch reports a connection closed partway through as a bare TypeError ("terminated").
					throw mapped instanceof TypeError ? new AgentStreamError("The connection to the model provider dropped before the response finished.", { code: "stream_dropped", retryable: true, cause: mapped }) : mapped;
				}
				// Some routes end without a completion event once every item is done; anything else may have been cut off, so it is not passed off as finished.
				if (unfinished || !completedItems.length) throw new AgentStreamError("The model's response ended before it finished.", { code: "stream_truncated", retryable: true });
				const final = toAgentModelResponse({ output: completedItems } as ResponsesResponse);
				if (!final.message.content) final.message.content = text;
				yield { type: "response.completed" as const, response: final };
			} finally { clearTimeout(timer); }
		},
	};
}
