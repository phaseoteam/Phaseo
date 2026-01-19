// OpenAI-Compatible Surface Executor
// Handles: OpenAI, Groq, DeepSeek, Together, Fireworks, and other OpenAI-compatible providers
// Uses OpenAI Responses API format upstream for consistency

import type { Surface, SurfaceExecuteArgs, SurfaceResult, Bill } from "../types";
import type { IRChatRequest, IRChatResponse } from "@core/ir";
import { irToOpenAIResponses, openAIResponsesToIR } from "./transform";
import { irToOpenAIChat, openAIChatToIR } from "./transform-chat";
import {
	openAICompatHeaders,
	openAICompatUrl,
	resolveOpenAICompatKey,
	resolveOpenAICompatRoute,
} from "@providers/openai-compatible/config";
import { computeBill } from "@pipeline/pricing/engine";
import { irToOpenAICompletions, openAICompletionsToIR } from "./transform-legacy";

/**
 * OpenAI-compatible surface
 * Executes IR requests using OpenAI Responses API format
 */
export const openaiCompatSurface: Surface = {
	name: "openai_compat",

        async execute(args: SurfaceExecuteArgs): Promise<SurfaceResult> {
                const upstreamStartMs = Date.now();
                // Resolve API key (gateway or BYOK)
                const keyInfo = resolveOpenAICompatKey({
                        providerId: args.providerId,
                        byokMeta: args.byokMeta,
                } as any);

		// Choose endpoint based on provider capabilities
		const modelForRouting = args.providerModelSlug ?? args.ir.model;
		const route = resolveOpenAICompatRoute(args.providerId, modelForRouting);
		const useResponses = route === "responses";
		const isLegacyCompletions = route === "legacy_completions";
		const endpoint = useResponses ? "/responses" : (isLegacyCompletions ? "/completions" : "/chat/completions");

		// Transform IR → OpenAI format (Responses or Chat based on support)
		const requestPayload = useResponses
			? irToOpenAIResponses(args.ir, args.providerModelSlug, args.providerId)
			: (isLegacyCompletions
				? irToOpenAICompletions(args.ir, args.providerModelSlug)
				: irToOpenAIChat(args.ir, args.providerModelSlug, args.providerId));

		// Always stream upstream for first-byte latency
		const payload = {
			...requestPayload,
			stream: true,
		};
		const requestBody = JSON.stringify(payload);
		const mappedRequest = args.meta.echoUpstreamRequest ? requestBody : undefined;

		// Execute upstream call
                const res = await fetch(openAICompatUrl(args.providerId, endpoint), {
                        method: "POST",
                        headers: openAICompatHeaders(args.providerId, keyInfo.key),
                        body: requestBody,
                });

		const bill: Bill = {
			cost_cents: 0,
			currency: "USD",
			usage: undefined,
			upstream_id: res.headers.get("x-request-id") || undefined,
			finish_reason: null,
		};
		if (!res.ok) {
			console.error(`Upstream error for provider ${args.providerId}: ${res.status} ${res.statusText}`);
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
                                stream: isLegacyCompletions ? transformLegacyCompletionsStream(res.body!, args) : res.body!,
                                usageFinalizer: createUsageFinalizer(res, args),
                                bill,
                                upstream: res,
                                keySource: keyInfo.source,
                                byokKeyId: keyInfo.byokId,
                                mappedRequest,
                                timing: {
                                        latencyMs: undefined,
                                        generationMs: undefined,
                                },
                        };
                } else {
                        // Buffer the stream and return complete response
                        const { ir, usage, rawResponse, firstByteMs, totalMs } = await bufferStreamToIR(res, args, route, upstreamStartMs);

			// Calculate pricing
			if (usage) {
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
                                rawResponse,
                                timing: {
                                        latencyMs: firstByteMs,
                                        generationMs: totalMs,
                                },
                        };
                }
        },
};

/**
 * Buffer OpenAI stream and convert to IR
 * Handles both Responses and Chat Completions formats
 */
async function bufferStreamToIR(
	res: Response,
	args: SurfaceExecuteArgs,
	route: "responses" | "chat" | "legacy_completions",
	upstreamStartMs: number,
): Promise<{ ir: IRChatResponse; usage: any; rawResponse: any; firstByteMs: number | null; totalMs: number }> {
        if (!res.body) {
                throw new Error("openai_stream_missing_body");
        }

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let finalResponse: any = null;

        let firstByteMs: number | null = null;
        while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (firstByteMs === null) {
                        firstByteMs = Date.now() - upstreamStartMs;
                }

		buf += decoder.decode(value, { stream: true });
		const frames = buf.split(/\n\n/);
		buf = frames.pop() ?? "";

		for (const raw of frames) {
			const lines = raw.split("\n");
			let data = "";

			for (const line of lines) {
				const l = line.replace(/\r$/, "");
				if (l.startsWith("data:")) {
					data += l.slice(5).trimStart();
				}
			}

			if (!data || data === "[DONE]") continue;

			let payload: any;
			try {
				payload = JSON.parse(data);
			} catch {
				continue;
			}

			// Responses API sends response in payload.response
			if (route === "responses" && payload?.response) {
				finalResponse = payload.response;
			}
			// Some providers return chat completions even on /responses
			else if (route === "responses" && Array.isArray(payload?.choices)) {
				finalResponse = accumulateChatCompletion(finalResponse, payload);
			}
			// Chat Completions streaming: accumulate chunks into final response
			else if (route === "chat") {
				finalResponse = accumulateChatCompletion(finalResponse, payload);
			}
			else if (route === "legacy_completions") {
				if (!finalResponse) {
					finalResponse = {
						id: payload.id,
						object: payload.object ?? "text_completion",
						created: payload.created,
						model: payload.model,
						choices: [],
					};
				}
				if (Array.isArray(payload?.choices)) {
					for (const chunk of payload.choices) {
						const idx = chunk.index || 0;
						if (!finalResponse.choices[idx]) {
							finalResponse.choices[idx] = {
								index: idx,
								text: "",
								finish_reason: null,
								logprobs: null,
							};
						}
						const choice = finalResponse.choices[idx];
						if (typeof chunk.text === "string") {
							choice.text = (choice.text || "") + chunk.text;
						}
						if (chunk.finish_reason) {
							choice.finish_reason = chunk.finish_reason;
						}
					}
				}
				if (payload?.usage) {
					finalResponse.usage = payload.usage;
				}
			}
		}
	}

	if (!finalResponse) {
		console.error(`Missing final response for provider ${args.providerId}, useResponses: ${useResponses}, buf length: ${buf.length}`);
		throw new Error("openai_stream_missing_response");
	}

	const isChatLikeResponse = isChatCompletionResponse(finalResponse);

	// Convert to IR using appropriate transformer
	const ir = route === "responses"
		? (isChatLikeResponse ? openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId) : openAIResponsesToIR(finalResponse, args.requestId, args.ir.model, args.providerId))
		: (route === "legacy_completions"
			? openAICompletionsToIR(finalResponse, args.requestId, args.ir.model, args.providerId)
			: openAIChatToIR(finalResponse, args.requestId, args.ir.model, args.providerId));

        const totalMs = Math.max(0, Date.now() - upstreamStartMs);
        return {
                ir,
                usage: finalResponse.usage,
                rawResponse: finalResponse,
                firstByteMs,
                totalMs,
        };
}

/**
 * Create finalizer for streaming responses
 * This is called after the stream completes to get final usage
 */
function createUsageFinalizer(
	res: Response,
	args: SurfaceExecuteArgs,
): () => Promise<Bill | null> {
	return async () => {
		// For streaming, we don't have final usage until the stream completes
		// This is handled by the existing streaming infrastructure in pipeline/after/stream.ts
		// For now, return null and let the existing finalizer handle it
		return null;
	};
}

function transformLegacyCompletionsStream(
	stream: ReadableStream<Uint8Array>,
	args: SurfaceExecuteArgs,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buf = "";

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buf += decoder.decode(value, { stream: true });
					const frames = buf.split(/\n\n/);
					buf = frames.pop() ?? "";

					for (const raw of frames) {
						let data = "";
						for (const line of raw.split(/\n/)) {
							const l = line.replace(/\r$/, "");
							if (l.startsWith("data:")) data += l.slice(5).trimStart();
						}
						if (!data || data === "[DONE]") continue;

						let payload: any;
						try {
							payload = JSON.parse(data);
						} catch {
							continue;
						}

						if (!Array.isArray(payload?.choices)) continue;

						const chunk = {
							id: payload.id ?? args.requestId,
							object: "chat.completion.chunk",
							created: payload.created ?? Math.floor(Date.now() / 1000),
							model: payload.model ?? args.ir.model,
							choices: payload.choices.map((choice: any) => ({
								index: choice.index ?? 0,
								delta: { content: choice.text ?? "" },
								finish_reason: choice.finish_reason ?? null,
							})),
							...(payload.usage ? { usage: payload.usage } : {}),
						};

						controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
					}
				}
			} catch (err) {
				console.error("openai legacy completions stream transform failed:", err);
			} finally {
				controller.close();
			}
		},
	});
}

function isChatCompletionResponse(payload: any): boolean {
	if (!payload || !Array.isArray(payload.choices)) return false;
	return payload.choices.some((choice: any) => choice?.message || choice?.delta);
}

function accumulateChatCompletion(finalResponse: any, payload: any): any {
	if (!payload || !Array.isArray(payload?.choices)) {
		if (payload?.usage && finalResponse) {
			finalResponse.usage = payload.usage;
		}
		return finalResponse;
	}

	let response = finalResponse;
	if (!response) {
		response = {
			id: payload.id,
			object: payload.object ?? "chat.completion",
			created: payload.created,
			model: payload.model,
			choices: [],
		};
	}

	for (const chunk of payload.choices) {
		const idx = chunk.index || 0;
		if (!response.choices[idx]) {
			response.choices[idx] = {
				index: idx,
				message: { role: "assistant", content: "" },
				finish_reason: null,
			};
		}
		const choice = response.choices[idx];

		if (chunk.message) {
			const message = chunk.message;
			choice.message = {
				role: message.role || choice.message?.role || "assistant",
				content: message.content ?? choice.message?.content ?? "",
				...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
				...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}),
			};
		}

		if (chunk.delta?.content) {
			choice.message.content = (choice.message.content || "") + chunk.delta.content;
		}
		if (chunk.delta?.reasoning_content) {
			choice.message.reasoning_content =
				(choice.message.reasoning_content || "") + chunk.delta.reasoning_content;
		}
		if (chunk.delta?.tool_calls) {
			if (!choice.message.tool_calls) choice.message.tool_calls = [];
			// Accumulate tool calls
			for (const tcDelta of chunk.delta.tool_calls) {
				const tcIdx = tcDelta.index || 0;
				if (!choice.message.tool_calls[tcIdx]) {
					choice.message.tool_calls[tcIdx] = {
						id: tcDelta.id || "",
						type: "function",
						function: { name: "", arguments: "" },
					};
				}
				const tc = choice.message.tool_calls[tcIdx];
				if (tcDelta.id) tc.id = tcDelta.id;
				if (tcDelta.function?.name) tc.function.name += tcDelta.function.name;
				if (tcDelta.function?.arguments) tc.function.arguments += tcDelta.function.arguments;
			}
		}
		if (chunk.finish_reason) {
			choice.finish_reason = chunk.finish_reason;
		}
		if (chunk.logprobs) {
			choice.logprobs = chunk.logprobs;
		}
	}

	if (payload?.usage) {
		response.usage = payload.usage;
	}

	return response;
}
