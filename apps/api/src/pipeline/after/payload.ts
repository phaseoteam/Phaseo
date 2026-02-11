// lib/gateway/after/payload.ts
// Purpose: After-stage logic for payload shaping, pricing, auditing, and streaming.
// Why: Keeps post-execution side-effects consistent.
// How: Encodes IR into protocol-specific client responses.

import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import type { GatewayCompletionsChoice } from "@core/types";
import type { IRChatResponse, IRUsage } from "@core/ir";
import { encodeAnthropicMessagesResponse } from "@/protocols/anthropic-messages/encode";
import { shapeUsageForClient } from "../usage";

type AnyRecord = Record<string, any>;

function asChatResponse(ir: RequestResult["ir"] | undefined): IRChatResponse | undefined {
	if (!ir || typeof ir !== "object") return undefined;
	if (!Array.isArray((ir as AnyRecord).choices)) return undefined;
	return ir as IRChatResponse;
}

/**
 * Enrich the protocol-encoded response with gateway metadata
 *
 * IMPORTANT: Uses result.normalized which is already protocol-encoded by encodeProtocol().
 * This ensures responses always match the requested endpoint format:
 * - /v1/chat/completions → Chat Completions format
 * - /v1/responses → Responses API format (built via buildResponsesPayload for completeness)
 * - /v1/messages → Anthropic Messages format
 */
export async function enrichSuccessPayload(ctx: PipelineContext, result: RequestResult) {
    // For Anthropic Messages, return the protocol-encoded payload without gateway-only fields.
    if (ctx.endpoint === "messages" || ctx.protocol === "anthropic.messages") {
        return result.normalized ?? {};
    }
    // For Responses API endpoint, use the complete buildResponsesPayload function
    // which includes ALL required fields (instructions, max_output_tokens, tools, etc.)
    if (ctx.endpoint === "responses") {
        const fullPayload = buildResponsesPayload(ctx, result);
        fullPayload.provider = result.provider;
        fullPayload.meta = {
            ...fullPayload.meta,
        };
        if (ctx.meta?.echoUpstreamRequest && result.mappedRequest) {
            fullPayload.upstream_request = result.mappedRequest;
        }
        return fullPayload;
    }

    // For other endpoints, use the protocol-encoded response (from encodeProtocol in pipeline/index.ts)
    const basePayload = result.normalized;
    const payload: any = basePayload ? structuredClone(basePayload) : {};

    // Separate native response ID (from response body) and upstream request ID (from headers)
    payload.nativeResponseId =
        (payload?.nativeResponseId as string | undefined) ?? null;
    payload.provider = result.provider;
    if (!payload.id) {
        payload.requestId = ctx.requestId;
    }

    payload.meta = {
        ...payload.meta,
    };
    if (ctx.meta?.echoUpstreamRequest && result.mappedRequest) {
        payload.upstream_request = result.mappedRequest;
    }

    return payload;
}

function buildResponsesPayload(ctx: PipelineContext, result: RequestResult): AnyRecord {
    const raw: AnyRecord | null = (result.rawResponse as AnyRecord | null | undefined) ?? null;
    const ir = asChatResponse(result.ir);
    const request = ctx.body ?? {};
    const startedAt = typeof ctx.meta.startedAtMs === "number"
        ? Math.floor(ctx.meta.startedAtMs / 1000)
        : Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const status = raw?.status ?? deriveResponsesStatus(ir);
    const usage = raw?.usage ?? (ir?.usage ? encodeResponsesUsage(ir.usage) : undefined);
    const hasRawOutput = Array.isArray(raw?.output) || Array.isArray(raw?.output_items);
    const output = hasRawOutput
        ? (Array.isArray(raw?.output) ? raw.output : raw?.output_items)
        : (ir ? buildResponsesOutput(ir, ctx.requestId) : []);
    const resolvedId = ctx.requestId ?? raw?.id ?? (ctx.requestId ? `resp_${ctx.requestId.replace(/^req_/, "")}` : ctx.requestId);
    // Separate native response ID (from response body) and upstream request ID (from headers)
    const nativeResponseId = raw?.id ?? raw?.nativeResponseId ?? null;

    return {
        id: resolvedId,
        object: "response",
        created_at: raw?.created_at ?? raw?.created ?? startedAt,
        status,
        completed_at: raw?.completed_at ?? (status === "completed" ? now : null),
        error: raw?.error ?? null,
        incomplete_details: raw?.incomplete_details ?? null,
        instructions: raw?.instructions ?? request.instructions ?? null,
        max_output_tokens: raw?.max_output_tokens ?? request.max_output_tokens ?? null,
        max_tool_calls: raw?.max_tool_calls ?? request.max_tool_calls ?? null,
        model: resolveClientModel(raw?.model, ctx.model),
        output,
        parallel_tool_calls: raw?.parallel_tool_calls ?? request.parallel_tool_calls ?? true,
        previous_response_id: raw?.previous_response_id ?? request.previous_response_id ?? null,
        reasoning: raw?.reasoning ?? (request.reasoning
            ? { effort: request.reasoning.effort ?? null, summary: request.reasoning.summary ?? null }
            : { effort: null, summary: null }),
        frequency_penalty: raw?.frequency_penalty ?? request.frequency_penalty ?? null,
        presence_penalty: raw?.presence_penalty ?? request.presence_penalty ?? null,
        store: raw?.store ?? request.store ?? null,
        temperature: raw?.temperature ?? request.temperature ?? null,
        text: raw?.text ?? request.text ?? null,
        tool_choice: raw?.tool_choice ?? request.tool_choice ?? null,
        tools: raw?.tools ?? request.tools ?? [],
        top_logprobs: raw?.top_logprobs ?? request.top_logprobs ?? null,
        top_p: raw?.top_p ?? request.top_p ?? null,
        truncation: raw?.truncation ?? request.truncation ?? "disabled",
        usage,
        user: raw?.user ?? request.user ?? null,
        background: raw?.background ?? request.background ?? null,
        service_tier: raw?.service_tier ?? request.service_tier ?? null,
        safety_identifier: raw?.safety_identifier ?? request.safety_identifier ?? null,
        prompt_cache_key: raw?.prompt_cache_key ?? request.prompt_cache_key ?? null,
        metadata: raw?.metadata ?? request.metadata ?? {},
        nativeResponseId,
    };
}

function resolveClientModel(
    rawModel: string | null | undefined,
    ctxModel: string,
): string {
    if (!rawModel) return ctxModel;
    if (!ctxModel) return rawModel;
    if (
        ctxModel.includes("/") &&
        !rawModel.includes("/") &&
        ctxModel.endsWith(`/${rawModel}`)
    ) {
        return ctxModel;
    }
    return rawModel;
}

function deriveResponsesStatus(ir?: IRChatResponse) {
    const mainChoice = ir?.choices?.[0];
    if (!mainChoice) return "completed";
    if (mainChoice.finishReason === "error") return "failed";
    if (mainChoice.finishReason === "length") return "incomplete";
    return "completed";
}

function encodeResponsesUsage(usage: IRUsage) {
    const inputDetails: Record<string, number> = {};
    const outputDetails: Record<string, number> = {};
    if (typeof usage.cachedInputTokens === "number") {
        inputDetails.cached_tokens = usage.cachedInputTokens;
    }
    if (typeof usage._ext?.inputImageTokens === "number") {
        inputDetails.input_images = usage._ext.inputImageTokens;
    }
    if (typeof usage._ext?.inputAudioTokens === "number") {
        inputDetails.input_audio = usage._ext.inputAudioTokens;
    }
    if (typeof usage._ext?.inputVideoTokens === "number") {
        inputDetails.input_videos = usage._ext.inputVideoTokens;
    }
    if (typeof usage.reasoningTokens === "number") {
        outputDetails.reasoning_tokens = usage.reasoningTokens;
    }
    if (typeof usage._ext?.cachedWriteTokens === "number") {
        outputDetails.cached_tokens = usage._ext.cachedWriteTokens;
    }
    if (typeof usage._ext?.outputImageTokens === "number") {
        outputDetails.output_images = usage._ext.outputImageTokens;
    }
    if (typeof usage._ext?.outputAudioTokens === "number") {
        outputDetails.output_audio = usage._ext.outputAudioTokens;
    }
    if (typeof usage._ext?.outputVideoTokens === "number") {
        outputDetails.output_videos = usage._ext.outputVideoTokens;
    }

    const out: any = {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
    };
    if (Object.keys(inputDetails).length) out.input_tokens_details = inputDetails;
    if (Object.keys(outputDetails).length) out.output_tokens_details = outputDetails;
    return out;
}

function buildResponsesOutput(ir: IRChatResponse, requestId: string) {
    const output: any[] = [];
    ir.choices.forEach((choice, idx) => {
        // Process content parts - separate reasoning from regular text
        const reasoningParts = choice.message.content.filter((p) => p.type === "reasoning_text");
        const textParts = choice.message.content.filter((p) => p.type === "text");
        const imageParts = choice.message.content.filter((p) => p.type === "image");

        // Add reasoning output items
        for (const reasoningPart of reasoningParts) {
            output.push({
                type: "reasoning",
                id: `reasoning_${requestId}_${idx}_${output.length}`,
                status: "completed",
                content: [
                    {
                        type: "output_text",
                        text: reasoningPart.text,
                        annotations: [],
                    },
                ],
            });
        }

        // Add message output item with regular text and images
        if (textParts.length > 0 || imageParts.length > 0) {
            output.push({
                type: "message",
                id: `msg_${requestId}_${idx}`,
                status: "completed",
                role: "assistant",
                content: [
                    ...textParts.map((p) => ({
                        type: "output_text",
                        text: p.text,
                        annotations: [],
                    })),
                    ...imageParts.map((p: any) => {
                        if (p.source === "data") {
                            return {
                                type: "output_image",
                                b64_json: p.data,
                                mime_type: p.mimeType,
                            };
                        }
                        return {
                            type: "output_image",
                            image_url: {
                                url: p.data,
                            },
                            mime_type: p.mimeType,
                        };
                    }),
                ],
            });
        }

        // Add function calls
        if (choice.message.toolCalls && choice.message.toolCalls.length > 0) {
            for (const toolCall of choice.message.toolCalls) {
                output.push({
                    type: "function_call",
                    call_id: toolCall.id,
                    name: toolCall.name,
                    arguments: toolCall.arguments,
                });
            }
        }
    });
    return output;
}

export function extractFinishReason(payload: any): string | null {
    // Chat Completions format: choices[].finish_reason
    if (Array.isArray(payload?.choices)) {
        return payload.choices.find((c: any) => typeof c?.finish_reason === "string")?.finish_reason ?? null;
    }

    // Anthropic Messages format: stop_reason at top level
    if (typeof payload?.stop_reason === "string") {
        return payload.stop_reason;
    }

    // Responses API format: status field + output items
    if (payload?.status) {
        if (payload.status === "failed") return "error";
        if (payload.status === "incomplete") {
            const reason = payload?.incomplete_details?.reason ?? payload?.error?.code ?? null;
            if (reason && String(reason).toLowerCase().includes("content")) return "content_filter";
            return "length";
        }
        if (payload.status === "completed") {
            const output = payload?.output ?? payload?.output_items ?? [];
            if (Array.isArray(output)) {
                const hasToolCall = output.some((item: any) => {
                    const type = String(item?.type ?? "").toLowerCase();
                    return type === "tool_call" || type === "function_call";
                });
                if (hasToolCall) return "tool_calls";
            }
            return "stop";
        }
    }

    return null;
}

export function presentUsageForClient(usage: any, ctx?: { endpoint?: PipelineContext["endpoint"] }) {
    if (!usage || typeof usage !== "object") return usage;
    const shaped = shapeUsageForClient(usage, { endpoint: ctx?.endpoint });
    const inputTokens = shaped.input_tokens ?? shaped.input_text_tokens ?? shaped.prompt_tokens ?? 0;
    const outputTokens = shaped.output_tokens ?? shaped.output_text_tokens ?? shaped.completion_tokens ?? 0;
    const totalTokens = shaped.total_tokens ?? inputTokens + outputTokens;
    const embeddingTokens = shaped.embedding_tokens ?? shaped.input_tokens ?? shaped.input_text_tokens;
    const outputVideoSeconds =
        typeof shaped.output_video_seconds === "number"
            ? shaped.output_video_seconds
            : undefined;

    const inputDetails = shaped.input_tokens_details ?? shaped.input_details ?? {};
    const outputDetails = shaped.output_tokens_details ?? shaped.completion_tokens_details ?? {};

    const pricing = (() => {
        const p = shaped.pricing ?? shaped.pricing_breakdown;
        if (!p) return undefined;
        return {
            total_nanos: p.total_nanos ?? p.totalNanos ?? 0,
            total_usd_str: p.total_usd_str ?? p.totalUsdStr ?? (typeof p.total_nanos === "number" ? (p.total_nanos / 1e9).toString() : undefined),
            total_cents: p.total_cents ?? p.totalCents ?? 0,
            currency: p.currency ?? "USD",
            lines: p.lines ?? [],
        };
    })();

    if (ctx?.endpoint === "chat.completions") {
        const out: any = {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: totalTokens,
        };
        if (Object.keys(inputDetails).length) out.prompt_tokens_details = inputDetails;
        if (Object.keys(outputDetails).length) out.completion_tokens_details = outputDetails;
        if (pricing) out.pricing = pricing;
        return out;
    }

    const out: any = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
    };
    if (outputVideoSeconds !== undefined) {
        out.output_video_seconds = outputVideoSeconds;
    }
    if (ctx?.endpoint === "embeddings" && embeddingTokens != null) {
        out.embedding_tokens = embeddingTokens;
    }

    if (Object.keys(inputDetails).length) out.input_tokens_details = inputDetails;
    if (Object.keys(outputDetails).length) out.output_tokens_details = outputDetails;
    if (pricing) out.pricing_breakdown = pricing;
    return out;
}

function toOaiChatChoices(choices: GatewayCompletionsChoice[] | undefined) {
    if (!Array.isArray(choices)) return [];
    return choices.map((c) => ({
        index: c.index ?? 0,
        message: {
            ...c.message,
            refusal: (c as any).refusal ?? null,
            annotations: (c as any).annotations ?? [],
        },
        logprobs: c.logprobs ?? null,
        finish_reason: c.finish_reason ?? null,
    }));
}

function buildChatCompletionsPayload(
    ctx: PipelineContext,
    result: RequestResult,
    payload: any
) {
    const ir = asChatResponse(result.ir);
    const created = payload?.created ??
        (typeof ctx.meta.startedAtMs === "number"
            ? Math.floor(ctx.meta.startedAtMs / 1000)
            : Math.floor(Date.now() / 1000));
    const resolvedId = payload?.id ??
        payload?.requestId ??
        ctx.requestId ??
        payload?.nativeResponseId ??
        null;
    const nativeResponseId =
        payload?.nativeResponseId ??
        ir?.nativeId ??
        null;
    const choices = (() => {
        if (Array.isArray(payload?.choices)) {
            return toOaiChatChoices(payload.choices);
        }
        if (ir?.choices) {
            return ir.choices.map((choice) => {
                // Extract text and reasoning content
                const textParts = choice.message.content.filter((p) => p.type === "text");
                const reasoningParts = choice.message.content.filter((p) => p.type === "reasoning_text");
                const imageParts = choice.message.content.filter((p) => p.type === "image");

                // Combine all text parts for content field
                const content = textParts.map((p) => p.text).join("");

                // Add reasoning_content if present (for Z.AI compatibility)
                const reasoningContent = reasoningParts.map((p) => p.text).join("");
                const images = imageParts.map((p: any) => ({
                    type: "image_url",
                    image_url: {
                        url: p.source === "data"
                            ? `data:${p.mimeType || "image/png"};base64,${p.data}`
                            : p.data,
                    },
                    ...(p.mimeType ? { mime_type: p.mimeType } : {}),
                }));

                return {
                    index: choice.index ?? 0,
                    message: {
                        role: "assistant",
                        content,
                        ...(images.length > 0 ? { images } : {}),
                        ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
                        tool_calls: choice.message.toolCalls?.map((tc) => ({
                            id: tc.id,
                            type: "function" as const,
                            function: {
                                name: tc.name,
                                arguments: tc.arguments,
                            },
                        })),
                        refusal: (choice.message as any)?.refusal ?? null,
                    },
                    logprobs: choice.logprobs ?? null,
                    finish_reason: choice.finishReason ?? null,
                };
            });
        }
        return [];
    })();
    const usageRaw = payload?.usage ?? (ir?.usage ? encodeChatUsage(ir.usage) : undefined);
    const usage = usageRaw ? presentUsageForClient(usageRaw, { endpoint: "chat.completions" }) : undefined;

    const body: any = {
        id: resolvedId,
        nativeResponseId,
        object: "chat.completion",
        created,
        model: payload?.model ?? ctx.model,
        choices,
        ...(usage ? { usage } : {}),
    };
    if (nativeResponseId == null) {
        delete body.nativeResponseId;
    }
    if ("service_tier" in (payload ?? {}) || ctx.body?.service_tier) {
        body.service_tier = payload?.service_tier ?? ctx.body?.service_tier ?? null;
    }
    if ("system_fingerprint" in (payload ?? {})) {
        body.system_fingerprint = payload?.system_fingerprint ?? null;
    }
    return body;
}

function buildAnthropicMessagesPayload(
    ctx: PipelineContext,
    result: RequestResult,
    payload: any,
    opts: { includeMeta: boolean; meta?: any }
) {
    const ir = asChatResponse(result.ir);
    const encoded = ir
        ? encodeAnthropicMessagesResponse(ir)
        : null;

    const candidate =
        (payload && payload.type === "message" && payload.role === "assistant") ? payload :
            ((result.rawResponse && (result.rawResponse as any).type === "message" && (result.rawResponse as any).role === "assistant")
                ? result.rawResponse
                : null);

    const base = encoded ?? (candidate ? structuredClone(candidate) : null) ?? {
        id: ctx.requestId,
        type: "message",
        role: "assistant",
        content: [],
        model: ctx.model,
        stop_reason: null,
        stop_sequence: null,
    };

    if (base && Array.isArray(base.content)) {
        for (const block of base.content) {
            if (block?.type === "text" && !("citations" in block)) {
                block.citations = null;
            }
            if (block?.type === "thinking" && !("signature" in block)) {
                block.signature = "";
            }
        }
    }

    base.id = base.id ?? ctx.requestId;
    base.model = base.model ?? ir?.model ?? ctx.model;
    base.stop_sequence = base.stop_sequence ?? null;

    const usage = base.usage ?? (ir?.usage ? encodeAnthropicMessagesResponse(ir).usage : undefined);
    base.usage = normalizeAnthropicUsage(usage, ir?.usage);

    delete base.nativeResponseId;
    delete base.provider;
    delete base.requestId;
    delete base.upstreamRequestId;
    delete base.upstream_request_id;
    if (!opts.includeMeta) {
        delete base.meta;
    }

    return base;
}

export function normalizeAnthropicUsage(raw: any, irUsage?: IRUsage) {
    const inputTokens = raw?.input_tokens ?? irUsage?.inputTokens ?? 0;
    const outputTokens = raw?.output_tokens ?? irUsage?.outputTokens ?? 0;
    const serviceTier = raw?.service_tier ?? (irUsage as any)?.serviceTier ?? null;
    const resolvedTier =
        serviceTier === "standard" || serviceTier === "priority" || serviceTier === "batch"
            ? serviceTier
            : null;
    const extras = raw && typeof raw === "object" ? { ...raw } : {};
    delete extras.cache_creation;
    delete extras.cache_creation_input_tokens;
    delete extras.cache_read_input_tokens;
    delete extras.input_tokens;
    delete extras.output_tokens;
    delete extras.server_tool_use;
    delete extras.service_tier;
    return {
        ...extras,
        cache_creation: raw?.cache_creation ?? null,
        cache_creation_input_tokens: raw?.cache_creation_input_tokens ?? null,
        cache_read_input_tokens: raw?.cache_read_input_tokens ?? null,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        server_tool_use: raw?.server_tool_use ?? null,
        service_tier: resolvedTier,
    };
}

function encodeChatUsage(usage: IRUsage) {
    return {
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        input_details: usage.cachedInputTokens
            ? {
                cached_tokens: usage.cachedInputTokens,
                input_images: usage._ext?.inputImageTokens,
                input_audio: usage._ext?.inputAudioTokens,
                input_videos: usage._ext?.inputVideoTokens,
            }
            : undefined,
        output_tokens_details:
            usage.reasoningTokens || usage._ext?.outputImageTokens || usage._ext?.outputAudioTokens
                ? {
                    reasoning_tokens: usage.reasoningTokens,
                    cached_tokens: usage._ext?.cachedWriteTokens,
                    output_images: usage._ext?.outputImageTokens,
                    output_audio: usage._ext?.outputAudioTokens,
                    output_videos: usage._ext?.outputVideoTokens,
                }
                : undefined,
        input_text_tokens: usage.inputTokens,
        output_text_tokens: usage.outputTokens,
        cached_read_text_tokens: usage.cachedInputTokens,
        reasoning_tokens: usage.reasoningTokens,
        cached_write_text_tokens: usage._ext?.cachedWriteTokens,
    };
}

export function formatClientPayload(args: {
    ctx: PipelineContext;
    result: RequestResult;
    payload: any;
    includeMeta: boolean;
}) {
    const { ctx, result, payload, includeMeta } = args;
    const meta = (() => {
        if (!includeMeta || !payload?.meta) return undefined;
        const clean = { ...payload.meta };
        delete (clean as any).provider;
        delete (clean as any).endpoint;
        delete (clean as any).model;
        delete (clean as any).requestId;
        delete (clean as any).finish_reason;
        delete (clean as any).timing;
        return clean;
    })();

    const usage = presentUsageForClient(payload?.usage, { endpoint: ctx.endpoint });

    if (ctx.endpoint === "messages" || ctx.protocol === "anthropic.messages") {
        const response = buildAnthropicMessagesPayload(ctx, result, payload, {
            includeMeta,
            meta,
        });
        if (usage) {
            response.usage = normalizeAnthropicUsage(usage, asChatResponse(result.ir)?.usage);
        }
        return response;
    }

    if (ctx.endpoint === "chat.completions") {
        if (ctx.protocol === "anthropic.messages") {
            return buildAnthropicMessagesPayload(ctx, result, payload, {
                includeMeta,
                meta,
            });
        }
        const body = buildChatCompletionsPayload(ctx, result, payload);
        if (ctx.meta?.echoUpstreamRequest && payload?.upstream_request) {
            body.upstream_request = payload.upstream_request;
        }
        if (meta) body.meta = meta;
        if (usage) body.usage = usage;
        return body;
    }

    if (ctx.endpoint === "responses") {
        // Use buildResponsesPayload to ensure all required OpenAI Responses API fields are present
        // This is critical for both streaming and non-streaming responses
        const body = buildResponsesPayload(ctx, result);

        // Override with streamed payload fields if they exist (for streaming responses)
        // The streamed payload may have accumulated data from SSE chunks
        if (payload) {
            Object.assign(body, payload);
            // Re-apply id resolution to ensure consistency
            body.id = payload.id ?? body.id;
            body.nativeResponseId = payload.nativeResponseId ?? body.nativeResponseId;
        }

        // Handle usage visibility flag
        if (usage) {
            body.usage = usage;
        }

        // Clean up nativeResponseId if null
        if (body.nativeResponseId == null) {
            delete body.nativeResponseId;
        }

        // Add meta and upstream_request if needed
        if (ctx.meta?.echoUpstreamRequest && payload?.upstream_request) {
            body.upstream_request = payload.upstream_request;
        }
        if (meta) body.meta = meta;

        return body;
    }

    if (ctx.endpoint === "moderations") {
        const {
            provider,
            requestId,
            meta: _m,
            usage: _u,
            id: payloadId,
            nativeResponseId: payloadNativeResponseId,
            nativeId: payloadNativeId,
            ...rest
        } = payload ?? {};
        const resolvedId = payloadId ?? requestId ?? ctx.requestId ?? null;
        const nativeResponseId = payloadNativeResponseId ?? payloadNativeId ?? null;
        const body: any = {
            object: "moderation",
            id: resolvedId,
            ...rest,
            ...(usage ? { usage } : {}),
        };
        if (nativeResponseId != null) {
            body.nativeResponseId = nativeResponseId;
        }
        if (meta) body.meta = meta;
        return body;
    }

    // Fallback: keep payload structure
    const fallback: any = {
        requestId: ctx.requestId,
        ...payload,
        ...(usage ? { usage } : {}),
    };
    if (meta) fallback.meta = meta;
    return fallback;
}










