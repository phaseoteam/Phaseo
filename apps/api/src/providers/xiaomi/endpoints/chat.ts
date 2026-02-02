// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import type { GatewayCompletionsResponse, GatewayUsage } from "@core/types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import {
    openAICompatHeaders,
    openAICompatUrl,
    resolveOpenAICompatKey,
} from "../../openai-compatible/config";

interface XiaomiChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
    reasoning_content?: string;
}

function mapGatewayToXiaomiChat(body: ChatCompletionsRequest): Record<string, unknown> {
    const messages: XiaomiChatMessage[] = (body.messages || []).map((msg: any) => {
        const mapped: XiaomiChatMessage = {
            role: msg.role,
            content: typeof msg.content === "string" ? msg.content : "",
        };
        if (msg.name) mapped.name = msg.name;
        if (msg.tool_call_id) mapped.tool_call_id = msg.tool_call_id;
        if (msg.reasoning_content) mapped.reasoning_content = msg.reasoning_content;
        return mapped;
    });

    const requestPayload: Record<string, unknown> = {
        model: body.model,
        messages,
        max_completion_tokens: body.max_output_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        frequency_penalty: body.frequency_penalty,
        presence_penalty: body.presence_penalty,
        seed: body.seed,
        stream: Boolean(body.stream),
        tools: body.tools,
        tool_choice: body.tool_choice,
        parallel_tool_calls: body.parallel_tool_calls,
        logit_bias: body.logit_bias,
        response_format: body.response_format,
        logprobs: body.logprobs,
        top_logprobs: body.top_logprobs,
        user: body.user_id,
    };

    const reasoning = body.reasoning;
    if (reasoning && "enabled" in reasoning) {
        requestPayload.thinking = reasoning.enabled
            ? { type: "enabled" }
            : { type: "disabled" };
    } else if (reasoning && "effort" in reasoning) {
        requestPayload.thinking = reasoning.effort === "none"
            ? { type: "disabled" }
            : { type: "enabled" };
    }

    return requestPayload;
}

function normalizeUsage(usage: any): GatewayUsage | undefined {
    if (!usage) return undefined;
    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    const total = usage.total_tokens ?? (input + output);
    const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
    return {
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        input_text_tokens: input,
        output_text_tokens: output,
        input_details: {
            cached_tokens: cachedTokens,
        },
        output_tokens_details: {
            reasoning_tokens: reasoningTokens,
        },
        reasoning_tokens: reasoningTokens,
        cached_read_text_tokens: cachedTokens,
    };
}

function mapXiaomiToGatewayChat(
    provider: string,
    model: string,
    json: any,
    requestId?: string
): GatewayCompletionsResponse {
    const choices = Array.isArray(json?.choices)
        ? json.choices.map((choice: any, idx: number) => ({
            index: typeof choice.index === "number" ? choice.index : idx,
            message: {
                role: "assistant",
                content: choice.message?.content ?? "",
                ...(Array.isArray(choice.message?.tool_calls) ? { tool_calls: choice.message.tool_calls } : {}),
                ...(typeof choice.message?.reasoning_content === "string" ? { reasoning_content: choice.message.reasoning_content } : {}),
            },
            finish_reason: choice.finish_reason ?? "stop",
            ...(choice.logprobs ? { logprobs: choice.logprobs } : {}),
            ...(typeof choice.message?.reasoning_content === "string" ? { reasoning: true } : {}),
        }))
        : [];

    return {
        id: requestId ?? json?.id ?? null,
        nativeResponseId: json?.id ?? null,
        created: json?.created ?? Math.floor(Date.now() / 1000),
        model,
        provider,
        choices,
        usage: normalizeUsage(json?.usage),
    };
}

type XiaomiToolCallAccumulator = {
    id: string;
    name?: string;
    arguments: string;
    index: number;
    reasoning_content?: string;
};

async function bufferXiaomiStream(
    res: Response,
    args: ProviderExecuteArgs
): Promise<{ normalized: GatewayCompletionsResponse; firstFrameMs: number | null }> {
    if (!res.body) {
        throw new Error("xiaomi_stream_missing_body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstFrameMs: number | null = null;
    const tStart = performance.now();

    let responseId: string | null = null;
    let created = Math.floor(Date.now() / 1000);
    let usage: any = undefined;

    type ChoiceAcc = {
        index: number;
        content: string;
        reasoning_content?: string;
        finish_reason?: string | null;
        toolCalls: Map<string, XiaomiToolCallAccumulator>;
    };
    const choices = new Map<number, ChoiceAcc>();

    const getChoice = (index: number) => {
        const existing = choices.get(index);
        if (existing) return existing;
        const createdChoice: ChoiceAcc = {
            index,
            content: "",
            finish_reason: null,
            toolCalls: new Map(),
        };
        choices.set(index, createdChoice);
        return createdChoice;
    };

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) {
            firstFrameMs = Math.round(performance.now() - tStart);
        }
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";

        for (const raw of frames) {
            let data = "";
            for (const line of raw.split("\n")) {
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

            if (payload?.id) responseId = payload.id;
            if (typeof payload?.created === "number") created = payload.created;
            if (payload?.usage) usage = payload.usage;

            const chunkChoices = Array.isArray(payload?.choices) ? payload.choices : [];
            for (const choice of chunkChoices) {
                const index = typeof choice?.index === "number" ? choice.index : 0;
                const acc = getChoice(index);
                if (choice?.finish_reason !== undefined && choice?.finish_reason !== null) {
                    acc.finish_reason = choice.finish_reason;
                }
                const delta = choice?.delta ?? {};
                if (typeof delta?.content === "string") {
                    acc.content += delta.content;
                }
                if (typeof delta?.reasoning_content === "string") {
                    acc.reasoning_content = (acc.reasoning_content || "") + delta.reasoning_content;
                }
                const toolDeltas = Array.isArray(delta?.tool_calls) ? delta.tool_calls : [];
                for (const [toolIndex, toolDelta] of toolDeltas.entries()) {
                    const key = toolDelta?.id ?? `${index}:${toolDelta?.index ?? toolIndex}`;
                    let toolAcc = acc.toolCalls.get(key);
                    if (!toolAcc) {
                        toolAcc = {
                            id: toolDelta?.id ?? key,
                            name: toolDelta?.function?.name,
                            arguments: "",
                            index: typeof toolDelta?.index === "number" ? toolDelta.index : toolIndex,
                        };
                        acc.toolCalls.set(key, toolAcc);
                    }
                    if (toolDelta?.function?.name) toolAcc.name = toolDelta.function.name;
                    if (typeof toolDelta?.function?.arguments === "string") {
                        toolAcc.arguments += toolDelta.function.arguments;
                    }
                }
            }
        }
    }

    const finalChoices = Array.from(choices.values())
        .sort((a, b) => a.index - b.index)
        .map((choice) => ({
            index: choice.index,
            message: {
                role: "assistant",
                content: choice.content,
                ...(choice.reasoning_content ? { reasoning_content: choice.reasoning_content } : {}),
                ...(choice.toolCalls.size
                    ? {
                        tool_calls: Array.from(choice.toolCalls.values())
                            .sort((a, b) => a.index - b.index)
                            .map((call) => ({
                                id: call.id,
                                type: "function",
                                function: {
                                    name: call.name ?? "",
                                    arguments: call.arguments ?? "",
                                },
                            })),
                    }
                    : {}),
            },
            finish_reason: choice.finish_reason ?? "stop",
            ...(choice.reasoning_content ? { reasoning: true } : {}),
        }));

    const openaiJson = {
        id: responseId,
        created,
        model: args.providerModelSlug || args.model,
        choices: finalChoices,
        ...(usage ? { usage } : {}),
    };

    const normalized = mapXiaomiToGatewayChat(
        args.providerId,
        args.model,
        openaiJson,
        args.meta.requestId
    );

    return { normalized, firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const { adapterPayload } = buildAdapterPayload(ChatCompletionsSchema, args.body, ["usage", "meta"]);
    const modifiedBody: ChatCompletionsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        stream: true,
    };
    const req = mapGatewayToXiaomiChat(modifiedBody);
    const res = await fetch(openAICompatUrl(args.providerId, "/chat/completions"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(req),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null as any,
    };

    if (args.stream) {
        return {
            kind: "stream",
            upstream: res,
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const { normalized, firstFrameMs } = await bufferXiaomiStream(res, args);
    if (firstFrameMs !== null) {
        args.meta.latency_ms = firstFrameMs;
    }

    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }
    if (normalized?.choices?.length) {
        bill.finish_reason = normalized.choices[normalized.choices.length - 1]?.finish_reason ?? null;
    }

    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(normalized ?? {}), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        }),
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

