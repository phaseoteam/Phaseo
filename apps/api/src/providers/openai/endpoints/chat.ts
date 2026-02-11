// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import type { GatewayCompletionsResponse, GatewayCompletionsChoice, GatewayUsage } from "@core/types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import type { ResolvedKey } from "../../keys";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";


type GatewayToolCall = {
    id: string;
    type: "function";
    function: {
        name: string;
        arguments: string;
    };
};


function coerceString(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === undefined || value === null) return "";
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function toInputText(text: string) {
    return { type: "input_text", text };
}

function toOutputText(text: string, logprobs?: any[]) {
    const payload: Record<string, unknown> = {
        type: "output_text",
        text,
        annotations: [],
    };
    if (Array.isArray(logprobs) && logprobs.length) {
        payload.logprobs = logprobs;
    }
    return payload;
}

function normalizeMessageContent(content: ChatCompletionsRequest["messages"][number]["content"]): any[] {
    if (typeof content === "string") return [toInputText(content)];
    if (!Array.isArray(content)) return [toInputText(coerceString(content))];
    const parts: any[] = [];
    for (const item of content) {
        if (!item) continue;
        switch (item.type) {
            case "text":
                parts.push(toInputText(item.text));
                break;
            case "image_url":
                parts.push({ type: "input_image", image_url: item.image_url.url });
                break;
            case "input_audio":
                parts.push({ type: "input_audio", input_audio: item.input_audio });
                break;
            case "input_video":
                parts.push(toInputText(`[video:${item.video_url}]`));
                break;
            case "tool_call":
                parts.push(toInputText(coerceString(item)));
                break;
            default:
                parts.push(toInputText(coerceString(item)));
                break;
        }
    }
    return parts.length ? parts : [toInputText("")];
}

function normalizeAssistantOutputs(content: ChatCompletionsRequest["messages"][number]["content"]): any[] {
    if (typeof content === "string") return [toOutputText(content)];
    if (!Array.isArray(content)) return [toOutputText(coerceString(content))];
    const outputs: any[] = [];
    for (const item of content) {
        if (!item) continue;
        if (item.type === "text") {
            outputs.push(toOutputText(item.text));
        } else {
            outputs.push(toOutputText(coerceString(item)));
        }
    }
    return outputs.length ? outputs : [toOutputText("")];
}

function normalizeFunctionOutput(content: ChatCompletionsRequest["messages"][number]["content"] | string): any {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return coerceString(content);
    const outputs: any[] = [];
    for (const item of content) {
        if (!item) continue;
        switch (item.type) {
            case "text":
                outputs.push(toInputText(item.text));
                break;
            case "image_url":
                outputs.push({ type: "input_image", image_url: item.image_url.url });
                break;
            default:
                outputs.push(toInputText(coerceString(item)));
                break;
        }
    }
    return outputs.length ? outputs : "";
}

function resolveReasoningParam(body: ChatCompletionsRequest) {
    const reasoning = body.reasoning;
    if (!reasoning) return undefined;

    const modelId = body.model ?? "";
    const isGpt51 = typeof modelId === "string" && modelId.includes("gpt-5.1");

    let effort = reasoning.effort ?? "medium";

    // For GPT-5.1 models, "none" is a first-class effort and effectively
    // replaces "minimal". Map legacy "minimal" -> "none" for compatibility.
    if (isGpt51) {
        if (effort === "minimal") {
            effort = "none";
        }
    } else {
        // For non-GPT-5.1 models, "none" is not supported by providers.
        // Treat it as "minimal" so callers can still send it via the unified API.
        if (effort === "none") {
            effort = "minimal";
        }
    }

    const resolved: Record<string, unknown> = { ...reasoning, effort };

    // If caller has asked for more than minimal / none reasoning, always request
    // a summary so the model returns user-visible text alongside internal reasoning.
    if (effort !== "minimal" && effort !== "none") {
        resolved.summary = "auto";
    }

    return resolved;
}

function mapMessageToInputItems(
    message: ChatCompletionsRequest["messages"][number],
    index: number
): any[] {
    if (message.role === "system" || message.role === "user") {
        return [{
            type: "message",
            role: message.role,
            content: normalizeMessageContent(message.content),
        }];
    }

    if (message.role === "assistant") {
        const items: any[] = [];
        const outputContent = normalizeAssistantOutputs(message.content);
        if (outputContent.length) {
            items.push({
                type: "message",
                role: "assistant",
                id: `msg_${index}`,
                status: "completed",
                content: outputContent,
            });
        }
        if (Array.isArray((message as any).tool_calls)) {
            let toolIdx = 0;
            for (const call of (message as any).tool_calls) {
                if (!call) continue;
                const callId = call.id ?? `tool_${index}_${toolIdx++}`;
                items.push({
                    type: "function_call",
                    id: callId,
                    call_id: callId,
                    name: call.function?.name ?? "function",
                    arguments: call.function?.arguments ?? "",
                });
            }
        }
        return items;
    }

    if (message.role === "tool") {
        const callId = (message as any).tool_call_id ?? `tool_result_${index}`;
        return [{
            type: "function_call_output",
            call_id: callId,
            output: normalizeFunctionOutput(message.content),
            status: "completed",
        }];
    }

    const _exhaustive: never = message as never;
    throw new Error(`Unsupported role in chat message: ${(message as any)?.role ?? "unknown"}`);
}

function mapGatewayToOpenAIResponses(body: ChatCompletionsRequest) {
    const inputItems: any[] = [];
    body.messages.forEach((m, idx) => {
        inputItems.push(...mapMessageToInputItems(m, idx));
    });

    const include: string[] = [];
    if (typeof body.top_logprobs === "number") {
        include.push("message.output_text.logprobs");
    }

    const payload: Record<string, unknown> = {
        model: body.model,
        input: inputItems,
        user: body.user_id,
        stream: Boolean(body.stream),
        max_output_tokens: body.max_output_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        top_k: body.top_k,
        frequency_penalty: body.frequency_penalty,
        presence_penalty: body.presence_penalty,
        seed: body.seed,
        reasoning: resolveReasoningParam(body),
        tool_choice: body.tool_choice,
        tools: body.tools,
        max_tool_calls: body.max_tool_calls,
        parallel_tool_calls: body.parallel_tool_calls,
        logit_bias: body.logit_bias,
        top_logprobs: typeof body.top_logprobs === "number" ? body.top_logprobs : undefined,
        response_format: body.response_format,
        safety_identifier: body.user_id,
        truncation: "auto",
    };

    if (include.length) {
        payload.include = include;
    }

    return payload;
}

function mapFinishReason(raw: unknown): "stop" | "length" | "tool_calls" | "content_filter" | "error" | null {
    const value = typeof raw === "string" ? raw.toLowerCase() : null;
    switch (value) {
        case "stop":
        case "length":
        case "tool_calls":
        case "content_filter":
        case "error":
            return value;
        case "completed":
        case "done":
        case null:
        case undefined:
            return "stop";
        default:
            return "stop";
    }
}

function mapFinishReasonFromJson(
    json: any,
    item?: any
): "stop" | "length" | "tool_calls" | "content_filter" | "error" | null {
    const statusRaw = (item && typeof item.status === "string") ? item.status : json?.status;
    const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : null;
    const incomplete = json?.incomplete_details ?? null;
    const incompleteReason = typeof incomplete?.reason === "string" ? incomplete.reason.toLowerCase() : null;

    if (status === "incomplete") {
        if (incompleteReason === "max_output_tokens") return "length";
        if (incompleteReason === "content_filter") return "content_filter";
        if (incompleteReason) return "error";
        return "length";
    }

    return mapFinishReason(status);
}

function normalizeUsage(usage: any | null | undefined): GatewayUsage | undefined {
    if (!usage) return undefined;
    const input = usage.input_tokens ?? 0;
    const output = usage.output_tokens ?? 0;
    const total = usage.total_tokens ?? (input + output);
    const normalized: GatewayUsage = {
        input_tokens: input,
        output_tokens: output,
        total_tokens: total,
        input_text_tokens: input,
        output_text_tokens: output,
    };
    if (usage.input_tokens_details) {
        normalized.input_details = {
            cached_tokens: usage.input_tokens_details.cached_tokens,
            input_images: usage.input_tokens_details.input_images,
            input_audio: usage.input_tokens_details.input_audio,
            input_videos: usage.input_tokens_details.input_videos,
        };
    }
    if (typeof usage.input_tokens_details?.cached_tokens === "number") {
        normalized.cached_read_text_tokens = usage.input_tokens_details.cached_tokens;
    }
    if (typeof usage.output_tokens_details?.reasoning_tokens === "number") {
        normalized.reasoning_tokens = usage.output_tokens_details.reasoning_tokens;
    }
    if (usage.output_tokens_details) {
        normalized.output_tokens_details = {
            reasoning_tokens: usage.output_tokens_details.reasoning_tokens,
            cached_tokens: usage.output_tokens_details.cached_tokens,
            output_images: usage.output_tokens_details.output_images,
            output_audio: usage.output_tokens_details.output_audio,
            output_videos: usage.output_tokens_details.output_videos,
        };
    }
    if (typeof usage.output_tokens_details?.cached_tokens === "number") {
        normalized.cached_write_text_tokens = usage.output_tokens_details.cached_tokens;
    }
    if (usage.pricing_breakdown) {
        (normalized as GatewayUsage & { pricing_breakdown?: unknown }).pricing_breakdown =
            usage.pricing_breakdown;
    }
    if (usage.service_tier) {
        (normalized as GatewayUsage & { service_tier?: unknown }).service_tier = usage.service_tier;
    }
    return normalized;
}

function flattenReasoning(item: any): string {
    // Support multiple possible shapes for reasoning segments.
    const root = item?.reasoning && typeof item.reasoning === "object" ? item.reasoning : item;

    const summary = Array.isArray(root?.summary) ? root.summary : [];
    const content = Array.isArray(root?.content) ? root.content : [];

    const summaryText = summary.map((s: any) => coerceString(s?.text ?? s)).join("");
    const contentText = content.map((c: any) => coerceString(c?.text ?? c)).join("");
    if (contentText || summaryText) {
        return contentText || summaryText;
    }

    // Fallback: recursively collect any nested `text` fields under the reasoning payload.
    const collected: string[] = [];

    const stack: any[] = [];
    if (root && typeof root === "object") stack.push(root);

    while (stack.length) {
        const current = stack.pop();
        if (!current || typeof current !== "object") continue;

        if (typeof (current as any).text === "string") {
            collected.push((current as any).text);
        }
        if (typeof (current as any).summary === "string") {
            collected.push((current as any).summary);
        }

        for (const key of Object.keys(current)) {
            const value = (current as any)[key];
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return collected.join("");
}

function flattenOutputMessage(item: any) {
    const content = Array.isArray(item?.content) ? item.content : [];
    const textParts: string[] = [];
    const logprobParts: any[] = [];
    for (const part of content) {
        if (!part) continue;
        // Primary: standard Responses API shape (output_text parts)
        if (part.type === "output_text" || (!part.type && typeof part.text === "string")) {
            if (typeof part.text === "string") {
                textParts.push(part.text);
            }
            if (Array.isArray(part.logprobs)) {
                logprobParts.push(...part.logprobs);
            }
            continue;
        }
        // Refusals
        if (part.type === "refusal" && typeof part.refusal === "string") {
            textParts.push(part.refusal);
            continue;
        }
        // Fallback: if we still have a bare text field on an unknown type,
        // treat it as assistant-visible text so newer models/shapes don't drop content.
        if (typeof part.text === "string") {
            textParts.push(part.text);
        }
    }
    return { text: textParts.join(""), logprobs: logprobParts };
}

function toGatewayToolCall(item: any): GatewayToolCall | null {
    if (!item) return null;
    const callId = item.call_id ?? item.id ?? null;
    if (!callId) return null;
    const args = typeof item.arguments === "string" ? item.arguments : coerceString(item.arguments);
    const name = item.name ?? item.function?.name ?? "function";
    return {
        id: callId,
        type: "function",
        function: {
            name,
            arguments: args ?? "",
        },
    };
}

function collectChoicesFromResponses(json: any): GatewayCompletionsChoice[] {
    const outputItems = Array.isArray(json?.output) ? json.output : [];
    const choices: GatewayCompletionsChoice[] = [];
    let idx = 0;

    for (const item of outputItems) {
        if (!item) continue;
        const isAssistantMessage =
            item?.role === "assistant" &&
            (item.type === "message" || item.type === "output" || item.type == null);
        if (isAssistantMessage) {
            const { text, logprobs } = flattenOutputMessage(item);
            if (!text && !logprobs.length) continue;
            const choice: GatewayCompletionsChoice = {
                index: idx++,
                message: { role: "assistant", content: text },
                finish_reason: mapFinishReasonFromJson(json, item),
            };
            if (logprobs.length) {
                choice.logprobs = logprobs;
            }
            choices.push(choice);
            continue;
        }

        if (item.type === "reasoning") {
            const reasoningText = flattenReasoning(item);
            if (!reasoningText) continue;
            choices.push({
                index: idx++,
                message: { role: "assistant", content: reasoningText },
                finish_reason: mapFinishReasonFromJson(json, item),
                reasoning: true,
            });
            continue;
        }

        if (item.type === "function_call") {
            const toolCall = toGatewayToolCall(item);
            if (!toolCall) continue;
            choices.push({
                index: idx++,
                message: { role: "assistant", content: "", tool_calls: [toolCall] },
                finish_reason: "tool_calls",
            });
        }
    }

    // Fallback: if nothing matched the expected shapes but the Responses API
    // still returned a text payload, try to recover it.
    if (!choices.length && typeof json?.output_text === "string" && json.output_text.length) {
        choices.push({
            index: idx++,
            message: { role: "assistant", content: json.output_text },
            finish_reason: mapFinishReasonFromJson(json),
        });
    }

    // Fallback 2: aggregate any text we can find from arbitrary output items.
    if (!choices.length && outputItems.length) {
        let aggregatedText = "";
        let aggregatedReasoning = "";

        for (const item of outputItems) {
            const { text } = flattenOutputMessage(item);
            if (text) {
                aggregatedText += (aggregatedText ? "\n" : "") + text;
            }
            if (item.type === "reasoning") {
                const reasoningText = flattenReasoning(item);
                if (reasoningText) {
                    aggregatedReasoning += (aggregatedReasoning ? "\n" : "") + reasoningText;
                }
            }
        }

        const finish = mapFinishReasonFromJson(json);

        if (aggregatedReasoning) {
            choices.push({
                index: idx++,
                message: { role: "assistant", content: aggregatedReasoning },
                finish_reason: finish,
                reasoning: true,
            });
        }

        if (aggregatedText) {
            choices.push({
                index: idx++,
                message: { role: "assistant", content: aggregatedText },
                finish_reason: finish,
            });
        }
    }

    // Fallback 3: never return an empty choices array.
    // If we reach this point and still have no choices, create a single
    // assistant message with empty content and a mapped finish_reason.
    if (!choices.length) {
        const finish = mapFinishReasonFromJson(json);
        choices.push({
            index: idx++,
            message: { role: "assistant", content: "" },
            finish_reason: finish,
        });
    }

    return choices;
}

function mapOpenAIToGatewayChat(model: string, json: any, requestId?: string): GatewayCompletionsResponse {
    const usage = normalizeUsage(json?.usage);
    const choices = collectChoicesFromResponses(json);
    const created = json?.created_at ?? json?.created ?? Math.floor(Date.now() / 1000);
    return {
        id: requestId ?? json?.id ?? null,
        nativeResponseId: json?.id ?? null,
        created,
        model,
        provider: "openai",
        choices,
        usage,
    };
}

function createBill(res: Response) {
    return {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };
}

function parseSseBlock(block: string) {
    const lines = block.split("\n");
    let event: string | null = null;
    let data = "";
    for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (line.startsWith("event:")) {
            event = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
            data += line.slice(5).trimStart();
        }
    }
    return { event, data };
}

function createOpenAIStreamResponse(
    res: Response,
    opts: {
        model: string;
        pricingCard: ProviderExecuteArgs["pricingCard"];
        requestId: string;
        bill: ReturnType<typeof createBill>;
        onFirstFrame?: (ms: number) => void;
        debug?: { enabled?: boolean } | boolean;
    }
) {
    if (!res.body) {
        throw new Error("openai_stream_missing_body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const transform = new TransformStream<Uint8Array, Uint8Array>();
    const writer = transform.writable.getWriter();
    const debugEnabled = typeof opts.debug === "boolean" ? opts.debug : Boolean(opts.debug?.enabled);
    const debugFrames: string[] = [];
    const maxDebugFrames = 20;
    let totalFrames = 0;
    let sawResponseCompleted = false;
    let sawResponseCreated = false;
    let sawOutputDelta = false;

    let buffer = "";
    const tStart = performance.now();
    let firstFrameMs: number | null = null;
    let nativeResponseId: string | null = null;
    let created = Math.floor(Date.now() / 1000);
    let finalResponse: any = null;
    let finalNormalized: GatewayCompletionsResponse | undefined;
    let finalBill: ReturnType<typeof createBill> | null = null;
    type ToolBufferEntry = { arguments: string; name?: string; output_index: number };
    const toolBuffer = new Map<string, ToolBufferEntry>();

    const emit = async (payload: any) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
    };

    const emitTextChunk = async (text: string, meta?: { reasoning?: boolean; logprobs?: any[]; output_index?: number }) => {
        if (!text) return;
        await emit({
            object: "chat.completion.chunk",
            nativeResponseId,
            created,
            model: opts.model,
            provider: "openai",
            choices: [{
                index: meta?.output_index ?? 0,
                delta: { role: "assistant", content: text },
                finish_reason: null,
                reasoning: Boolean(meta?.reasoning),
                ...(Array.isArray(meta?.logprobs) && meta.logprobs.length ? { logprobs: meta.logprobs } : {}),
            }],
        });
    };

    const emitToolChunk = async (callId: string, entry: { arguments: string; name?: string; output_index: number }) => {
        await emit({
            object: "chat.completion.chunk",
            nativeResponseId,
            created,
            model: opts.model,
            provider: "openai",
            choices: [{
                index: entry.output_index ?? 0,
                delta: {
                    role: "assistant",
                    tool_calls: [{
                        id: callId,
                        type: "function",
                        function: {
                            name: entry.name ?? "",
                            arguments: entry.arguments ?? "",
                        },
                    }],
                },
                finish_reason: null,
            }],
        });
    };

    const finalizeResponse = (response: any) => {
        if (!response || finalNormalized) return;
        finalNormalized = mapOpenAIToGatewayChat(opts.model, response, opts.requestId);
        nativeResponseId = nativeResponseId ?? finalNormalized.nativeResponseId ?? null;
        if (finalNormalized.choices?.length) {
            opts.bill.finish_reason = finalNormalized.choices[finalNormalized.choices.length - 1]?.finish_reason ?? null;
        }
        if (finalNormalized.usage) {
            const priced = computeBill(finalNormalized.usage, opts.pricingCard);
            opts.bill.cost_cents = priced.pricing.total_cents;
            opts.bill.currency = priced.pricing.currency;
            opts.bill.usage = priced;
        }
        finalBill = { ...opts.bill };
    };

    (async () => {
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (opts.onFirstFrame && firstFrameMs === null) {
                    firstFrameMs = Math.round(performance.now() - tStart);
                    opts.onFirstFrame(firstFrameMs);
                }
                buffer += decoder.decode(value, { stream: true });
                const frames = buffer.split(/\n\n/);
                buffer = frames.pop() ?? "";

                for (const raw of frames) {
                    totalFrames += 1;
                    if (debugEnabled) {
                        const trimmed = raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw;
                        debugFrames.push(trimmed);
                        if (debugFrames.length > maxDebugFrames) {
                            debugFrames.shift();
                        }
                    }
                    const { event, data } = parseSseBlock(raw);
                    if (!data || data === "[DONE]") continue;
                    let payload: any;
                    try {
                        payload = JSON.parse(data);
                    } catch {
                        continue;
                    }

                    switch (event) {
                        case "response.created":
                            nativeResponseId = payload?.response?.id ?? payload?.id ?? nativeResponseId;
                            created = payload?.response?.created_at ?? payload?.created_at ?? created;
                            sawResponseCreated = true;
                            break;
                        case "response.output_text.delta":
                            if (typeof payload?.delta === "string") {
                                sawOutputDelta = true;
                                await emitTextChunk(payload.delta, { logprobs: payload.logprobs, output_index: payload.output_index });
                            }
                            break;
                        case "response.reasoning_text.delta":
                            if (typeof payload?.delta === "string") {
                                await emitTextChunk(payload.delta, { reasoning: true, output_index: payload.output_index });
                            }
                            break;
                        case "response.function_call_arguments.delta": {
                            const itemId = payload?.item_id;
                            if (!itemId) break;
                            const entry: ToolBufferEntry = toolBuffer.get(itemId) ?? { arguments: "", output_index: payload?.output_index ?? 0 };
                            if (typeof payload?.delta === "string") {
                                entry.arguments += payload.delta;
                            }
                            toolBuffer.set(itemId, entry);
                            await emitToolChunk(itemId, entry);
                            break;
                        }
                        case "response.function_call_arguments.done": {
                            const itemId = payload?.item_id;
                            if (!itemId) break;
                            const entry: ToolBufferEntry = toolBuffer.get(itemId) ?? { arguments: "", output_index: payload?.output_index ?? 0 };
                            if (typeof payload?.arguments === "string") {
                                entry.arguments = payload.arguments;
                            }
                            if (typeof payload?.name === "string") {
                                entry.name = payload.name;
                            }
                            toolBuffer.set(itemId, entry);
                            await emitToolChunk(itemId, entry);
                            break;
                        }
                        case "response.completed":
                            finalResponse = payload?.response ?? finalResponse;
                            sawResponseCompleted = true;
                            break;
                        case "response.failed":
                        case "error":
                            throw new Error(payload?.error?.message ?? "openai_stream_failed");
                        default:
                            break;
                    }
                }
            }

            if (finalResponse) {
                finalizeResponse(finalResponse);
            }

            if (!finalNormalized) {
                if (debugEnabled) {
                    console.log("[gateway][openai] stream missing completion", {
                        requestId: opts.requestId,
                        status: res.status,
                        headers: Object.fromEntries(res.headers.entries()),
                        totalFrames,
                        sawResponseCreated,
                        sawOutputDelta,
                        sawResponseCompleted,
                        bufferTail: buffer.length > 2000 ? `${buffer.slice(0, 2000)}…` : buffer,
                        debugFrames,
                    });
                }
                throw new Error("openai_stream_missing_completion");
            }

            await emit({
                object: "chat.completion",
                ...finalNormalized,
            });
        } catch (err) {
            if (debugEnabled) {
                console.log("[gateway][openai] stream error", {
                    requestId: opts.requestId,
                    status: res.status,
                    headers: Object.fromEntries(res.headers.entries()),
                    totalFrames,
                    sawResponseCreated,
                    sawOutputDelta,
                    sawResponseCompleted,
                    bufferTail: buffer.length > 2000 ? `${buffer.slice(0, 2000)}…` : buffer,
                    debugFrames,
                    error: err instanceof Error ? err.message : err,
                });
            }
            console.error("OpenAI streaming error:", err);
            await emit({
                object: "error",
                message: err instanceof Error ? err.message : "stream_error",
            });
        } finally {
            try { await writer.close(); } catch { }
        }
    })();

    const headers = new Headers();
    headers.set("Content-Type", "text/event-stream");
    headers.set("Cache-Control", "no-store");
    headers.set("x-gateway-request-id", opts.requestId);
    headers.set("x-gateway-stream-shape", "delta");

    if (debugEnabled) {
        console.log("[gateway][openai] stream opened", {
            requestId: opts.requestId,
            status: res.status,
            headers: Object.fromEntries(res.headers.entries()),
        });
    }

    return {
        response: new Response(transform.readable, { status: res.status, headers }),
        usageFinalizer: async () => finalBill,
    };
}

async function bufferOpenAIStreamResponse(
    res: Response,
    opts: {
        model: string;
        pricingCard: ProviderExecuteArgs["pricingCard"];
        bill: ReturnType<typeof createBill>;
        requestId: string;
        debug?: { enabled?: boolean } | boolean;
    }
): Promise<{ normalized: GatewayCompletionsResponse; bill: ReturnType<typeof createBill>; firstFrameMs: number | null }> {
    if (!res.body) {
        throw new Error("openai_stream_missing_body");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const debugEnabled = typeof opts.debug === "boolean" ? opts.debug : Boolean(opts.debug?.enabled);
    const debugFrames: string[] = [];
    const maxDebugFrames = 20;
    let totalFrames = 0;
    let sawResponseCompleted = false;

    let buffer = "";
    let finalResponse: any = null;
    let firstFrameMs: number | null = null;
    const t0 = performance.now();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) {
            firstFrameMs = Math.round(performance.now() - t0);
        }
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n/);
        buffer = frames.pop() ?? "";

        for (const raw of frames) {
            totalFrames += 1;
            if (debugEnabled) {
                const trimmed = raw.length > 2000 ? `${raw.slice(0, 2000)}…` : raw;
                debugFrames.push(trimmed);
                if (debugFrames.length > maxDebugFrames) {
                    debugFrames.shift();
                }
            }
            const { event, data } = parseSseBlock(raw);
            if (!data || data === "[DONE]") continue;
            let payload: any;
            try {
                payload = JSON.parse(data);
            } catch {
                continue;
            }
            if (event === "response.completed") {
                finalResponse = payload?.response ?? finalResponse;
                sawResponseCompleted = true;
            }
            if (event === "response.failed" || event === "error") {
                if (debugEnabled) {
                    console.log("[gateway][openai] stream failed", {
                        requestId: opts.requestId,
                        status: res.status,
                        headers: Object.fromEntries(res.headers.entries()),
                        totalFrames,
                        sawResponseCompleted,
                        bufferTail: buffer.length > 2000 ? `${buffer.slice(0, 2000)}…` : buffer,
                        debugFrames,
                        error: payload?.error ?? null,
                    });
                }
                throw new Error(payload?.error?.message ?? "openai_stream_failed");
            }
        }
    }

    if (!finalResponse) {
        if (debugEnabled) {
            console.log("[gateway][openai] buffered stream missing completion", {
                requestId: opts.requestId,
                status: res.status,
                headers: Object.fromEntries(res.headers.entries()),
                totalFrames,
                sawResponseCompleted,
                bufferTail: buffer.length > 2000 ? `${buffer.slice(0, 2000)}…` : buffer,
                debugFrames,
            });
        }
        throw new Error("openai_stream_missing_completion");
    }

    const normalized = mapOpenAIToGatewayChat(opts.model, finalResponse, opts.requestId);
    const bill = opts.bill;
    if (normalized?.choices?.length) {
        bill.finish_reason = normalized.choices[normalized.choices.length - 1]?.finish_reason ?? null;
    }
    if (normalized?.usage) {
        const priced = computeBill(normalized.usage, opts.pricingCard);
        bill.cost_cents = priced.pricing.total_cents;
        bill.currency = priced.pricing.currency;
        bill.usage = priced;
    }

    return { normalized, bill, firstFrameMs };
}

async function execNonStreaming(
    args: ProviderExecuteArgs,
    key: string,
    keyInfo: ResolvedKey,
    requestPayload: Record<string, unknown>
): Promise<AdapterResult> {
    const res = await fetch(openAICompatUrl(args.providerId, "/responses"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, key),
        body: JSON.stringify(requestPayload),
    });

    const jsonTest = await res.clone().json().catch(() => null);
    console.log("OpenAI non-streaming response:", jsonTest);

    const bill = createBill(res);
    const json = await res.clone().json().catch(() => null);
    const normalized = json ? mapOpenAIToGatewayChat(args.model, json, args.meta.requestId) : undefined;

    // Debug: help diagnose empty choices when usage is present
    if (json && (!normalized || !normalized.choices || !normalized.choices.length)) {
        try {
            const outputItems = Array.isArray((json as any).output) ? (json as any).output : [];
            const outputSummary = outputItems.slice(0, 5).map((item: any, index: number) => ({
                index,
                type: item?.type,
                role: item?.role,
                status: item?.status,
                contentTypes: Array.isArray(item?.content)
                    ? item.content.map((part: any) => part?.type ?? (typeof part?.text === "string" ? "text" : typeof part))
                    : null,
            }));
            console.log("[OpenAI non-stream] No choices extracted from response", {
                model: args.model,
                providerModelSlug: args.providerModelSlug,
                status: res.status,
                jsonKeys: Object.keys(json as any),
                hasOutputArray: Array.isArray((json as any).output),
                outputLength: outputItems.length,
                outputSummary,
                outputTextType: typeof (json as any).output_text,
                statusField: (json as any).status,
                max_output_tokens: (json as any).max_output_tokens,
                incomplete_details: (json as any).incomplete_details,
                rawOutputSample: outputItems.length ? outputItems[0] : null,
                usage: (json as any).usage,
            });
        } catch (logErr) {
            console.log("[OpenAI non-stream] Failed to log empty-choices debug info", logErr);
        }
    }

    if (normalized?.usage) {
        const priced = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = priced.pricing.total_cents;
        bill.currency = priced.pricing.currency;
        bill.usage = priced;
    } else if (normalized?.usage !== undefined) {
        bill.usage = normalized.usage;
    }
    if (normalized?.choices?.length) {
        bill.finish_reason = normalized.choices[normalized.choices.length - 1]?.finish_reason ?? null;
    } else if (json) {
        bill.finish_reason = mapFinishReasonFromJson(json);
    }

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

async function execStreaming(
    args: ProviderExecuteArgs,
    key: string,
    keyInfo: ResolvedKey,
    requestPayload: Record<string, unknown>
): Promise<AdapterResult> {
    const res = await fetch(openAICompatUrl(args.providerId, "/responses"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, key),
        body: JSON.stringify(requestPayload),
    });

    if (!res.body) {
        // Fallback to non-streaming if upstream did not return a stream.
        return execNonStreaming(args, key, keyInfo, { ...requestPayload, stream: false });
    }

    const bill = createBill(res);
    const { response, usageFinalizer } = createOpenAIStreamResponse(res, {
        model: args.model,
        pricingCard: args.pricingCard,
        requestId: args.meta.requestId,
        bill,
        debug: args.meta.debug,
    });

    return {
        kind: "stream",
        upstream: response,
        bill,
        usageFinalizer,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const { canonical, adapterPayload } = buildAdapterPayload(ChatCompletionsSchema, args.body, ["usage", "meta"]);
    const modifiedBody: ChatCompletionsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        // Always stream upstream to capture first-byte latency
        stream: true,
    };
    const requestPayload = mapGatewayToOpenAIResponses(modifiedBody);
    const key = keyInfo.key;

    const res = await fetch(openAICompatUrl(args.providerId, "/responses"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, key),
        body: JSON.stringify(requestPayload),
    });
    const bill = createBill(res);

    if (args.stream) {
        const { response, usageFinalizer } = createOpenAIStreamResponse(res, {
            model: args.model,
            pricingCard: args.pricingCard,
            requestId: args.meta.requestId,
            bill,
            onFirstFrame: (ms) => {
                args.meta.latency_ms = ms;
            },
            debug: args.meta.debug,
        });
        return {
            kind: "stream",
            upstream: response,
            bill,
            usageFinalizer,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const { normalized, bill: finalBill, firstFrameMs } = await bufferOpenAIStreamResponse(res, {
        model: args.model,
        pricingCard: args.pricingCard,
        bill,
        requestId: args.meta.requestId,
        debug: args.meta.debug,
    });

    if (firstFrameMs !== null) {
        args.meta.latency_ms = firstFrameMs;
    }

    return {
        kind: "completed",
        upstream: new Response(JSON.stringify(normalized), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
        }),
        bill: finalBill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

