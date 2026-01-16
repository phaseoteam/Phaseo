// Anthropic Surface Executor
// Handles: Anthropic Messages API
// CRITICAL FIX: Properly extracts tool_use blocks from responses!

import type { Surface, SurfaceExecuteArgs, SurfaceResult, Bill } from "../types";
import type { IRChatRequest, IRChatResponse, IRChoice, IRUsage, IRToolCall } from "@core/ir";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { computeBill } from "@pipeline/pricing/engine";

/**
 * Anthropic surface
 * Executes IR requests using Anthropic Messages API
 */
export const anthropicSurface: Surface = {
	name: "anthropic",

	async execute(args: SurfaceExecuteArgs): Promise<SurfaceResult> {
		// Resolve API key (gateway or BYOK)
		const keyInfo = resolveProviderKey(
			{
				providerId: args.providerId,
				byokMeta: args.byokMeta,
			} as any,
			() => {
				const bindings = getBindings() as any;
				return bindings.ANTHROPIC_API_KEY;
			},
		);

		// Transform IR → Anthropic Messages format
		const requestPayload = irToAnthropicMessages(args.ir);

                const requestBody = {
                        ...requestPayload,
                        model: args.providerModelSlug || args.ir.model,
                        stream: true,
                };
                const requestPayloadJson = JSON.stringify(requestBody);
                const mappedRequest = args.meta.echoUpstreamRequest ? requestPayloadJson : undefined;

                // Execute upstream call
                const res = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                                "x-api-key": keyInfo.key,
                                "Content-Type": "application/json",
                                "anthropic-version": "2023-06-01",
                        },
                        body: requestPayloadJson,
                });

		// Initialize billing
                const bill: Bill = {
                        cost_cents: 0,
                        currency: "USD",
                        usage: undefined,
                        upstream_id: res.headers.get("request-id") || undefined,
                        finish_reason: null,
                };
                if (!res.ok) {
                        return {
                                kind: "completed",
                                ir: undefined,
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                        };
                }

                // Handle streaming vs non-streaming
                if (args.ir.stream) {
                        // Return stream directly
                        return {
                                kind: "stream",
                                stream: res.body!,
                                usageFinalizer: createUsageFinalizer(res, args),
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                        };
                } else {
                        // Buffer streaming response into a final snapshot
                        const { message, firstFrameMs, totalMs } = await bufferAnthropicStreamToMessage(res);

                        // CRITICAL: Convert to IR with proper tool_use extraction
                        const ir = anthropicMessagesToIR(message, args.requestId, args.ir.model, args.providerId);

			// Calculate pricing
			if (ir.usage) {
				const usage = anthropicUsageToGeneric(ir.usage);
				const priced = computeBill(usage, args.pricingCard);
				bill.cost_cents = priced.pricing.total_cents;
				bill.currency = priced.pricing.currency;
				bill.usage = priced;
			}

                        return {
                                kind: "completed",
                                ir,
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                                rawResponse: message,
                                timing: {
                                        latencyMs: firstFrameMs ?? undefined,
                                        generationMs: totalMs ?? undefined,
                                },
                        };
                }
        },
};

async function bufferAnthropicStreamToMessage(res: Response): Promise<{ message: any; firstFrameMs: number | null; totalMs: number | null }> {
        if (!res.body) throw new Error("anthropic_stream_missing_body");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let final: any = null;
        const tStart = performance.now();
        let firstFrameMs: number | null = null;

        while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (firstFrameMs === null) {
                        firstFrameMs = Math.round(performance.now() - tStart);
                }
                buf += dec.decode(value, { stream: true });
                const frames = buf.split(/\n\n/);
                buf = frames.pop() ?? "";
                for (const raw of frames) {
                        const lines = raw.split("\n");
                        let data = "";
                        for (const line of lines) {
                                const l = line.replace(/\r$/, "");
                                if (l.startsWith("data:")) data += l.slice(5).trimStart();
                        }
                        if (!data || data === "[DONE]") continue;
                        let payload: any;
                        try { payload = JSON.parse(data); } catch { continue; }
                        if (payload?.type === "message_stop" || payload?.type === "message") {
                                final = payload?.message ?? payload;
                        }
                }
        }

        if (!final) throw new Error("anthropic_stream_missing_completion");
        const totalMs = Math.round(performance.now() - tStart);
        return { message: final, firstFrameMs, totalMs };
}

/**
 * Transform IR request to Anthropic Messages format
 */
function irToAnthropicMessages(ir: IRChatRequest): any {
	const messages: any[] = [];
	let system: string | undefined;

	for (const msg of ir.messages) {
		if (msg.role === "system") {
			// Anthropic has system as a separate field
			system = msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
		} else if (msg.role === "user") {
			messages.push({
				role: "user",
				content: msg.content.map(mapIRContentToAnthropic),
			});
		} else if (msg.role === "assistant") {
			const content: any[] = [];

			// Add text content
			for (const part of msg.content) {
				if (part.type === "text") {
					content.push({ type: "text", text: part.text });
				}
			}

			// Add tool_use blocks
			if (msg.toolCalls) {
				for (const tc of msg.toolCalls) {
					content.push({
						type: "tool_use",
						id: tc.id,
						name: tc.name,
						input: JSON.parse(tc.arguments),
					});
				}
			}

			messages.push({ role: "assistant", content });
		} else if (msg.role === "tool") {
			// Tool results as user message with tool_result blocks
			messages.push({
				role: "user",
				content: msg.toolResults.map((result) => ({
					type: "tool_result",
					tool_use_id: result.toolCallId,
					content: result.content,
				})),
			});
		}
	}

	const request: any = {
		messages,
		system: system || undefined,
		max_tokens: ir.maxTokens || 4096,
	};

	// Add generation parameters
	if (ir.temperature !== undefined) request.temperature = ir.temperature;
	if (ir.topP !== undefined) request.top_p = ir.topP;
	if (ir.topK !== undefined) request.top_k = ir.topK;

	// Add tools
	if (ir.tools && ir.tools.length > 0) {
		request.tools = ir.tools.map((t) => ({
			name: t.name,
			description: t.description,
			input_schema: t.parameters,
		}));
	}

	if (ir.toolChoice) {
		if (typeof ir.toolChoice === "string") {
			if (ir.toolChoice === "auto") request.tool_choice = { type: "auto" };
			else if (ir.toolChoice === "required") request.tool_choice = { type: "any" };
		} else {
			request.tool_choice = { type: "tool", name: ir.toolChoice.name };
		}
	}

	// Add other parameters
	if (ir.stop) request.stop_sequences = Array.isArray(ir.stop) ? ir.stop : [ir.stop];
	if (ir.metadata) request.metadata = ir.metadata;

	return request;
}

/**
 * Map IR content part to Anthropic content block
 */
function mapIRContentToAnthropic(part: any): any {
	if (part.type === "text") {
		return { type: "text", text: part.text };
	}

	if (part.type === "image") {
		if (part.source === "url") {
			return {
				type: "image",
				source: { type: "url", url: part.data },
			};
		} else {
			return {
				type: "image",
				source: {
					type: "base64",
					media_type: part.mimeType || "image/jpeg",
					data: part.data,
				},
			};
		}
	}

	// Fallback
	return { type: "text", text: String(part) };
}

/**
 * Transform Anthropic Messages response to IR format
 * CRITICAL FIX: Properly extracts tool_use blocks!
 */
function anthropicMessagesToIR(
	json: any,
	requestId: string,
	model: string,
	provider: string,
): IRChatResponse {
	const toolCalls: IRToolCall[] = [];
	const textParts: string[] = [];

	// Extract content blocks
	for (const block of json.content || []) {
		if (block.type === "text") {
			textParts.push(block.text);
		} else if (block.type === "tool_use") {
			// CRITICAL: Extract tool_use blocks
			toolCalls.push({
				id: block.id,
				name: block.name,
				arguments: JSON.stringify(block.input),
			});
		}
	}

	// Determine finish reason
	let finishReason: IRChoice["finishReason"] = "stop";
	if (json.stop_reason === "max_tokens") {
		finishReason = "length";
	} else if (json.stop_reason === "tool_use" || toolCalls.length > 0) {
		finishReason = "tool_calls";
	} else if (json.stop_reason === "stop_sequence") {
		finishReason = "stop";
	}

	const choice: IRChoice = {
		index: 0,
		message: {
			role: "assistant",
			content: textParts.join(""),
			toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
		},
		finishReason,
		// Preserve which stop sequence triggered (Anthropic-specific)
		stopSequence: json.stop_sequence ?? undefined,
	};

	// Validate ID presence
	if (!json.id) {
		console.warn(`[ID-VALIDATION] Provider ${provider} (Anthropic Messages) did not return response ID`);
	}

	return {
		id: requestId,
		nativeId: json.id,
		created: Math.floor(Date.now() / 1000),
		model,
		provider,
		choices: [choice],
		usage: json.usage
			? {
				inputTokens: json.usage.input_tokens || 0,
				outputTokens: json.usage.output_tokens || 0,
				totalTokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
			}
			: undefined,
	};
}

/**
 * Convert Anthropic usage to generic format for pricing
 */
function anthropicUsageToGeneric(usage: IRUsage): any {
	return {
		input_tokens: usage.inputTokens,
		output_tokens: usage.outputTokens,
		total_tokens: usage.totalTokens,
		input_text_tokens: usage.inputTokens,
		output_text_tokens: usage.outputTokens,
	};
}

/**
 * Create finalizer for streaming responses
 */
function createUsageFinalizer(res: Response, args: SurfaceExecuteArgs): () => Promise<Bill | null> {
	return async () => {
		// For streaming, usage will be in the final chunk
		// This is handled by the existing streaming infrastructure
		return null;
	};
}
