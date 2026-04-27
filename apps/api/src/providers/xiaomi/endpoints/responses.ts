// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import type { ResponsesRequest } from "@core/schemas";
import { ResponsesSchema } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import {
    openAICompatHeaders,
    openAICompatUrl,
    resolveOpenAICompatKey,
} from "../../openai-compatible/config";

type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string;
    tool_call_id?: string;
    reasoning_content?: string;
};

function normalizeRole(value: unknown): ChatMessage["role"] {
    switch (value) {
        case "system":
        case "assistant":
        case "tool":
            return value;
        default:
            return "user";
    }
}

function normalizeInputContent(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        const parts: string[] = [];
        let hasStructured = false;
        for (const part of value) {
            if (!part) continue;
            if (typeof part === "string") {
                parts.push(part);
                continue;
            }
            if (typeof part === "object") {
                const typed = part as Record<string, unknown>;
                const type = typed.type;
                if ((type === "input_text" || type === "text") && typeof typed.text === "string") {
                    parts.push(typed.text);
                    continue;
                }
            }
            hasStructured = true;
        }
        if (parts.length && !hasStructured) return parts.join("");
    }
    return JSON.stringify(value ?? "");
}

function pushMessage(messages: ChatMessage[], item: any) {
    if (item == null) return;
    if (typeof item === "string") {
        messages.push({ role: "user", content: item });
        return;
    }
    if (typeof item === "object") {
        const role = normalizeRole((item as any).role);
        const contentSource =
            (item as any).content ??
            (item as any).input ??
            (item as any).text ??
            item;
        const content = normalizeInputContent(contentSource);
        messages.push({
            role,
            content,
            name: typeof (item as any).name === "string" ? (item as any).name : undefined,
            tool_call_id:
                typeof (item as any).tool_call_id === "string"
                    ? (item as any).tool_call_id
                    : undefined,
            ...(typeof (item as any).reasoning_content === "string"
                ? { reasoning_content: (item as any).reasoning_content }
                : {}),
        });
    }
}

function mapResponsesToChat(body: ResponsesRequest): ChatMessage[] {
    const messages: ChatMessage[] = [];
    if (typeof body.instructions === "string" && body.instructions.trim()) {
        messages.push({ role: "system", content: body.instructions });
    }

    const input = body.input;
    if (Array.isArray(input)) {
        for (const item of input) pushMessage(messages, item);
    } else if (input !== undefined) {
        pushMessage(messages, input);
    }

    if (Array.isArray(body.input_items)) {
        for (const item of body.input_items) pushMessage(messages, item);
    }

    if (!messages.length) {
        messages.push({ role: "user", content: "" });
    }

    return messages;
}

function normalizeUsage(usage: any) {
    if (!usage || typeof usage !== "object") return undefined;
    const input = usage.prompt_tokens ?? 0;
    const output = usage.completion_tokens ?? 0;
    const total = usage.total_tokens ?? input + output;
    const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;
    return {
        input_text_tokens: input,
        output_text_tokens: output,
        total_tokens: total,
        input_tokens_details: {
            cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
            input_images: usage.prompt_tokens_details?.audio_tokens ?? 0,
        },
        output_tokens_details: {
            reasoning_tokens: reasoningTokens,
        },
        pricing_breakdown: undefined as any,
    };
}

interface XiaomiChoice {
    index: number;
    message: {
        content: string;
        role?: string;
        tool_calls?: any[];
        reasoning_content?: string;
    };
    finish_reason: string | null;
    logprobs?: any;
}

function getReasoningConfig(reasoning: any): { effort?: string; summary?: string } | null {
    if (!reasoning) return null;
    if ("effort" in reasoning) {
        return {
            effort: reasoning.effort,
            summary: reasoning.summary,
        };
    }
    if ("enabled" in reasoning && reasoning.enabled) {
        return {
            effort: "medium",
            summary: "auto",
        };
    }
    return null;
}

function buildResponsesPayload(
    args: ProviderExecuteArgs,
    json: Record<string, unknown>,
    upstreamId: string | null,
    reasoningConfig?: { effort?: string; summary?: string } | null
) {
    const now = Math.floor(Date.now() / 1000);
    const id = `resp_${crypto.randomUUID?.() ?? Date.now()}`;
    const created = (json.created as number) ?? now;
    const completedAt = now;

    const choices = json.choices as XiaomiChoice[] | undefined;
    const firstChoice = choices?.[0];
    const contentText = firstChoice?.message?.content ?? "";
    const reasoningContent = firstChoice?.message?.reasoning_content;
    const usage = normalizeUsage(json.usage);

    const outputItems: any[] = [];

    if (reasoningContent) {
        outputItems.push({
            id: `rs_${crypto.randomUUID?.() ?? Date.now()}`,
            type: "reasoning",
            summary: [
                {
                    type: "summary_text",
                    text: reasoningContent,
                },
            ],
        });
    }

    if (firstChoice?.message?.role === "assistant" || contentText) {
        outputItems.push({
            id: `msg_${crypto.randomUUID?.() ?? Date.now()}`,
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
                {
                    type: "output_text",
                    text: contentText,
                    annotations: [],
                    logprobs: firstChoice?.logprobs?.content ?? [],
                },
            ],
        });
    }

    return {
        object: "response",
        id,
        created_at: created,
        status: "completed",
        background: false,
        completed_at: completedAt,
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: null,
        max_tool_calls: null,
        model: args.model,
        output: outputItems,
        parallel_tool_calls: true,
        previous_response_id: null,
        prompt_cache_key: null,
        prompt_cache_retention: null,
        reasoning: reasoningConfig ?? null,
        safety_identifier: null,
        service_tier: "default",
        store: true,
        temperature: 1,
        text: {
            format: {
                type: "text",
            },
            verbosity: "medium",
        },
        tool_choice: "auto",
        tools: [],
        top_logprobs: 0,
        top_p: 1,
        truncation: "disabled",
        user: null,
        metadata: {},
        nativeResponseId: upstreamId,
        usage,
    };
}

function parseSseBlock(block: string) {
    const lines = block.split("\n");
    let data = "";
    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("data:")) {
            data += line.slice(5).trimStart();
        }
    }
    return data;
}

function createResponsesStreamFromChat(
    res: Response,
    args: ProviderExecuteArgs,
    bill: ReturnType<typeof createBill>,
    reasoningConfig?: { effort?: string; summary?: string } | null
) {
    if (!res.body) {
        throw new Error("xiaomi_stream_missing_body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const writer = transform.writable.getWriter();

    let buffer = "";
    let firstFrameMs: number | null = null;
    const tStart = performance.now();

    let responseId: string | null = null;
    let created = Math.floor(Date.now() / 1000);
    let outputText = "";
    let reasoningText = "";
    let finishReason: string | null = null;
    let usage: any = undefined;
    const outputItems: any[] = [];

    const debugEnabled = (args.meta as any)?.debug === true;
    
    const emit = async (event: string, payload: any) => {
        console.log(`[xiaomi-adapter] emitting event: ${event}`, JSON.stringify(payload).slice(0, 200));
        await writer.write(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
        );
    };

    const finalize = async (reasoningCfg?: { effort?: string; summary?: string } | null) => {
        const response = buildResponsesPayload(args, {
            id: responseId,
            created,
            choices: [{ message: { content: outputText, reasoning_content: reasoningText }, index: 0, finish_reason: finishReason }],
            usage,
        }, bill.upstream_id, reasoningCfg);
        if (response.usage) {
            const priced = computeBill(response.usage, args.pricingCard);
            response.usage.pricing_breakdown = priced.pricing;
            bill.cost_cents = priced.pricing.total_cents;
            bill.currency = priced.pricing.currency;
            bill.usage = priced;
        }
        bill.finish_reason = finishReason;
        await emit("response.completed", { response });
    };

    (async () => {
        try {
            await emit("response.created", {
                response: {
                    id: `resp_${crypto.randomUUID?.() ?? Date.now()}`,
                    created_at: created,
                    model: args.model,
                },
            });
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (firstFrameMs === null) {
                    firstFrameMs = Math.round(performance.now() - tStart);
                    args.meta.latency_ms = firstFrameMs;
                }
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split(/\n\n/);
                buffer = frames.pop() ?? "";
                for (const raw of frames) {
                    const data = parseSseBlock(raw);
                    if (!data || data === "[DONE]") continue;
                    if (debugEnabled) {
                        console.log(`[xiaomi-adapter] raw frame:`, raw.slice(0, 500));
                    }
                    let payload: any;
                    try {
                        payload = JSON.parse(data);
                    } catch {
                        continue;
                    }
                    if (debugEnabled) {
                        console.log(`[xiaomi-adapter] parsed payload:`, JSON.stringify(payload).slice(0, 500));
                    }
                    if (payload?.id) responseId = payload.id;
                    if (typeof payload?.created === "number") created = payload.created;
                    if (payload?.usage) usage = payload.usage;
                    const choices = Array.isArray(payload?.choices) ? payload.choices : [];
                    for (const choice of choices) {
                        if (choice?.finish_reason) {
                            finishReason = choice.finish_reason;
                        }
                        const delta = choice?.delta ?? {};
                        if (typeof delta?.content === "string") {
                            outputText += delta.content;
                            await emit("response.output_text.delta", {
                                delta: delta.content,
                                output_index: outputItems.length,
                            });
                        }
                        if (typeof delta?.reasoning_content === "string") {
                            reasoningText += delta.reasoning_content;
                            console.log(`[xiaomi-adapter] reasoning_content delta:`, delta.reasoning_content.slice(0, 100));
                            await emit("response.reasoning.delta", {
                                delta: delta.reasoning_content,
                                output_index: 0,
                            });
                        }
                    }
                }
            }
            await finalize(reasoningConfig);
        } catch (err) {
            await writer.abort(err);
        } finally {
            await writer.close();
        }
    })();

    return new Response(transform.readable, {
        status: res.status,
        headers: { "Content-Type": "text/event-stream" },
    });
}

function createBill(res: Response) {
    return {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null as any,
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const { adapterPayload } = buildAdapterPayload(ResponsesSchema, args.body, [
        "usage",
        "meta",
    ]);
    const body: ResponsesRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || (adapterPayload.model as string),
    };

    const messages = mapResponsesToChat(body);
    const requestPayload: Record<string, unknown> = {
        model: body.model,
        messages,
        max_completion_tokens: body.max_output_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        frequency_penalty: body.frequency_penalty,
        presence_penalty: body.presence_penalty,
        stream: Boolean(args.stream),
        tools: body.tools,
        tool_choice: body.tool_choice,
        parallel_tool_calls: body.parallel_tool_calls,
        user: body.user,
    };

    const reasoning = body.reasoning;
    const reasoningConfig = getReasoningConfig(reasoning);
    if (reasoning && "enabled" in reasoning) {
        requestPayload.thinking = reasoning.enabled
            ? { type: "enabled" }
            : { type: "disabled" };
    } else if (reasoning && "effort" in reasoning) {
        requestPayload.thinking = reasoning.effort === "none"
            ? { type: "disabled" }
            : { type: "enabled" };
    }

    const res = await fetch(openAICompatUrl(args.providerId, "/chat/completions"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(requestPayload),
    });

    const bill = createBill(res);

    const debugEnabled = (args.meta as any)?.debug === true;
    if (debugEnabled) {
        const bodyText = await res.clone().text();
        console.log("[xiaomi-adapter] upstream response", {
            status: res.status,
            statusText: res.statusText,
            body: bodyText.slice(0, 2000),
        });
    }

    if (args.stream) {
        return {
            kind: "stream",
            upstream: createResponsesStreamFromChat(res, args, bill, reasoningConfig),
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    if (!res.ok) {
        return {
            kind: "completed",
            upstream: res,
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const json: Record<string, unknown> = await res.json();
    const normalized = buildResponsesPayload(args, json, bill.upstream_id, reasoningConfig);
    console.log('[xiaomi-adapter] normalized response output:', JSON.stringify(normalized.output, null, 2));
    
    if (normalized?.usage) {
        const priced = computeBill(normalized.usage, args.pricingCard);
        normalized.usage.pricing_breakdown = priced.pricing;
        bill.cost_cents = priced.pricing.total_cents;
        bill.currency = priced.pricing.currency;
        bill.usage = priced;
    }
    
    const choices = json.choices as XiaomiChoice[] | undefined;
    if (Array.isArray(choices) && choices.length) {
        bill.finish_reason = choices[choices.length - 1]?.finish_reason ?? null;
    }

    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(normalized), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        }),
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

