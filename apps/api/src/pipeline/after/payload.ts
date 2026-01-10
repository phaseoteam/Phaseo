// lib/gateway/after/payload.ts
import type { PipelineContext } from "../before/types";
import type { RequestResult } from "../execute";
import type { GatewayCompletionsChoice } from "@core/types";
import type { IRChatResponse, IRUsage } from "@core/ir";
import { shapeUsageForClient } from "../usage";

export async function enrichSuccessPayload(ctx: PipelineContext, result: RequestResult) {
    const basePayload = ctx.endpoint === "responses"
        ? buildResponsesPayload(ctx, result)
        : result.normalized;
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

function buildResponsesPayload(ctx: PipelineContext, result: RequestResult) {
    const raw = result.rawResponse ?? null;
    const ir = result.ir;
    const request = ctx.body ?? {};
    const startedAt = typeof ctx.meta.startedAtMs === "number"
        ? Math.floor(ctx.meta.startedAtMs / 1000)
        : Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const status = raw?.status ?? deriveResponsesStatus(ir);
    const usage = raw?.usage ?? (ir?.usage ? encodeResponsesUsage(ir.usage) : undefined);
    const output = raw?.output ?? raw?.output_items ?? (ir ? buildResponsesOutput(ir, ctx.requestId) : []);
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
        model: raw?.model ?? ctx.model,
        output,
        parallel_tool_calls: raw?.parallel_tool_calls ?? request.parallel_tool_calls ?? true,
        previous_response_id: raw?.previous_response_id ?? request.previous_response_id ?? null,
        reasoning: raw?.reasoning ?? (request.reasoning
            ? { effort: request.reasoning.effort ?? null, summary: request.reasoning.summary ?? null }
            : { effort: null, summary: null }),
        store: raw?.store ?? request.store ?? null,
        temperature: raw?.temperature ?? request.temperature ?? null,
        text: raw?.text ?? request.text ?? null,
        tool_choice: raw?.tool_choice ?? request.tool_choice ?? null,
        tools: raw?.tools ?? request.tools ?? [],
        top_p: raw?.top_p ?? request.top_p ?? null,
        truncation: raw?.truncation ?? request.truncation ?? "disabled",
        usage,
        user: raw?.user ?? request.user ?? null,
        metadata: raw?.metadata ?? request.metadata ?? {},
        nativeResponseId,
    };
}

function deriveResponsesStatus(ir?: IRChatResponse) {
    const mainChoice = ir?.choices?.find((c) => !c.reasoning) ?? ir?.choices?.[0];
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
        const content: any[] = [];
        if (choice.message.content) {
            content.push({
                type: "output_text",
                text: choice.message.content,
                annotations: [],
            });
        }
        output.push({
            type: "message",
            id: `msg_${requestId}_${idx}`,
            status: "completed",
            role: "assistant",
            content,
        });
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
    return Array.isArray(payload?.choices)
        ? (payload.choices.find((c: any) => typeof c?.finish_reason === "string")?.finish_reason ?? null)
        : null;
}

export function presentUsageForClient(usage: any) {
    if (!usage || typeof usage !== "object") return usage;
    const shaped = shapeUsageForClient(usage);
    const inputTokens = shaped.input_tokens ?? shaped.input_text_tokens ?? shaped.prompt_tokens ?? 0;
    const outputTokens = shaped.output_tokens ?? shaped.output_text_tokens ?? shaped.completion_tokens ?? 0;
    const totalTokens = shaped.total_tokens ?? inputTokens + outputTokens;

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

    const out: any = {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
    };

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
    const ir = result.ir;
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
            return ir.choices.map((choice) => ({
                index: choice.index ?? 0,
                message: {
                    role: "assistant",
                    content: choice.message.content,
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
            }));
        }
        return [];
    })();
    const usage = payload?.usage ?? (ir?.usage ? encodeChatUsage(ir.usage) : undefined);

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
    opts: { includeUsage: boolean; includeMeta: boolean; meta?: any }
) {
    const candidate =
        (payload && payload.type === "message" && payload.role === "assistant") ? payload :
            ((result.rawResponse && (result.rawResponse as any).type === "message" && (result.rawResponse as any).role === "assistant")
                ? result.rawResponse
                : null);

    const ir = result.ir;
    const hasCandidate = candidate && typeof candidate === "object";
    const candidateClone = hasCandidate ? structuredClone(candidate) : null;
    if (candidateClone && !opts.includeUsage) {
        delete (candidateClone as any).usage;
    }

    const mainChoice = ir?.choices?.find((c) => !c.reasoning) ?? ir?.choices?.[0];
    const content: any[] = [];
    if (mainChoice?.message?.content) {
        content.push({
            type: "text",
            text: mainChoice.message.content,
        });
    }
    if (mainChoice?.message?.toolCalls?.length) {
        for (const tc of mainChoice.message.toolCalls) {
            content.push({
                type: "tool_use",
                id: tc.id,
                name: tc.name,
                input: JSON.parse(tc.arguments),
            });
        }
    }

    const usage = opts.includeUsage && ir?.usage
        ? {
            input_tokens: ir.usage.inputTokens,
            output_tokens: ir.usage.outputTokens,
        }
        : undefined;

    const resolvedNativeResponseId =
        payload?.nativeResponseId ??
        candidateClone?.nativeResponseId ??
        ir?.nativeId ??
        ((candidateClone?.id && candidateClone?.id !== ctx.requestId) ? candidateClone.id : null);
    const resolvedUsage = opts.includeUsage
        ? (candidateClone?.usage ?? usage)
        : undefined;

    const response: any = {
        id: ctx.requestId,
        nativeResponseId: resolvedNativeResponseId ?? null,
        type: candidateClone?.type ?? "message",
        role: candidateClone?.role ?? "assistant",
        content: candidateClone?.content ?? content,
        model: candidateClone?.model ?? ir?.model ?? ctx.model,
        stop_reason: candidateClone?.stop_reason ?? null,
        stop_sequence: candidateClone?.stop_sequence ?? null,
        ...(resolvedUsage ? { usage: resolvedUsage } : {}),
    };
    if (resolvedNativeResponseId == null) {
        delete response.nativeResponseId;
    }
    if (opts.includeMeta && opts.meta) {
        response.meta = opts.meta;
    }
    delete response.provider;
    delete response.requestId;
    delete response.upstreamRequestId;
    delete response.upstream_request_id;
    return response;
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
    includeUsage: boolean;
    includeMeta: boolean;
}) {
    const { ctx, result, payload, includeUsage, includeMeta } = args;
    const usage = includeUsage ? presentUsageForClient(payload?.usage) : undefined;
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

    if (ctx.endpoint === "chat.completions") {
        if (ctx.protocol === "anthropic.messages") {
            return buildAnthropicMessagesPayload(ctx, result, payload, {
                includeUsage,
                includeMeta,
                meta,
            });
        }
        const body = buildChatCompletionsPayload(ctx, result, payload);
        if (!includeUsage && "usage" in body) delete body.usage;
        if (ctx.meta?.echoUpstreamRequest && payload?.upstream_request) {
            body.upstream_request = payload.upstream_request;
        }
        if (meta) body.meta = meta;
        return body;
    }

    if (ctx.endpoint === "responses") {
        const {
            provider,
            requestId,
            meta: _m,
            usage: _u,
            nativeResponseId: payloadNativeResponseId,
            id: payloadId,
            object: payloadObject,
            ...rest
        } = payload ?? {};
        const resolvedId =
            payloadId ?? requestId ?? ctx.requestId ?? payloadNativeResponseId ?? null;
        const resolvedNativeResponseId = payloadNativeResponseId ?? null;
        const body: any = {
            id: resolvedId,
            nativeResponseId: resolvedNativeResponseId,
            object: payloadObject ?? "response",
            ...rest,
            ...(usage ? { usage } : {}),
        };
        if (resolvedNativeResponseId == null) {
            delete body.nativeResponseId;
        }
        if (meta) body.meta = meta;
        return body;
    }

    if (ctx.endpoint === "moderations") {
        const { provider, requestId, meta: _m, usage: _u, id: payloadId, ...rest } = payload ?? {};
        const resolvedId = requestId ?? ctx.requestId ?? payloadId ?? payload?.nativeResponseId ?? null;
        const body: any = {
            object: "moderation",
            id: resolvedId,
            ...rest,
            ...(usage ? { usage } : {}),
        };
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
