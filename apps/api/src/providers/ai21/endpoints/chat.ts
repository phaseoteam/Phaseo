// src/lib/gateway/providers/ai21/endpoints/chat.ts
// Purpose: Provider endpoint adapter for ai21 (chat).
// Why: Encapsulates provider-specific request/response mapping.
// How: Defines provider-specific endpoint adapters and configuration helpers.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { ChatCompletionsSchema, type ChatCompletionsRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { computeBill } from "@pipeline/pricing/engine";
import { resolveProviderKey, type ResolvedKey } from "../../keys";

const BASE_URL = "https://api.ai21.com";

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().AI21_API_KEY);
}

function baseHeaders(key: string) {
    return {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
    };
}

function mapGatewayToAI21Chat(body: ChatCompletionsRequest) {
    const messages: any[] = [];

    for (const m of body.messages || []) {
        if (m.role === "system") {
            messages.push({
                role: "system",
                content: typeof m.content === "string" ? m.content : "",
            });
        } else if (m.role === "user") {
            messages.push({
                role: "user",
                content: typeof m.content === "string" ? m.content : "",
            });
        } else if (m.role === "assistant") {
            const msg: any = {
                role: "assistant",
                content: typeof m.content === "string" ? m.content : "",
            };
            if (m.tool_calls && m.tool_calls.length > 0) {
                msg.tool_calls = m.tool_calls.map((tc: any) => ({
                    id: tc.id,
                    type: "function",
                    function: {
                        name: tc.function?.name,
                        arguments: tc.function?.arguments,
                    },
                }));
            }
            messages.push(msg);
        } else if (m.role === "tool") {
            messages.push({
                role: "tool",
                content: typeof m.content === "string" ? m.content : "",
                tool_call_id: m.tool_call_id,
            });
        }
    }

    return {
        model: body.model,
        messages,
        max_tokens: body.max_output_tokens,
        temperature: body.temperature,
        top_p: body.top_p,
        stop: (body as any).stop,
        stream: Boolean(body.stream),
        tools: body.tools,
    };
}

export function mapAI21ToGatewayChat(json: any, requestId?: string): any {
    const choices = (json.choices || []).map((choice: any) => {
        const message = choice.message || {};
        let content = message.content || "";
        
        if (message.tool_calls && message.tool_calls.length > 0) {
            content = "";
        }

        const finishReasonMap: { [key: string]: string } = {
            "stop": "stop",
            "length": "length",
            "tool_calls": "tool_calls",
            "error": "error",
        };

        return {
            index: choice.index || 0,
            message: {
                role: "assistant",
                content,
                tool_calls: message.tool_calls?.map((tc: any) => ({
                    id: tc.id,
                    type: tc.type || "function",
                    function: {
                        name: tc.function?.name,
                        arguments: tc.function?.arguments,
                    },
                })),
            },
            finish_reason: finishReasonMap[choice.finish_reason] || "stop",
            reasoning: false,
        };
    });

    return {
        id: requestId ?? json.id ?? null,
        nativeResponseId: json.id ?? null,
        created: json.created ? Math.floor(new Date(json.created).getTime() / 1000) : Math.floor(Date.now() / 1000),
        model: json.model,
        provider: "ai21",
        choices,
        usage: {
            input_text_tokens: json.usage?.input_tokens || 0,
            output_text_tokens: json.usage?.output_tokens || 0,
            total_tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
        },
    };
}

async function bufferAI21Stream(res: Response, requestId: string) {
    if (!res.body) throw new Error("ai21_stream_missing_body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let final: any = null;
    let firstFrameMs: number | null = null;
    const tStart = performance.now();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) firstFrameMs = Math.round(performance.now() - tStart);
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
            const trimmed = line.replace(/^\s*data:\s*/, "");
            if (!trimmed || trimmed === "[DONE]") continue;
            try {
                const payload = JSON.parse(trimmed);
                if (payload.choices && payload.choices.length > 0) {
                    const choice = payload.choices[0];
                    if (choice.finish_reason) {
                        final = payload;
                    }
                }
            } catch {
                continue;
            }
        }
    }

    if (!final) throw new Error("ai21_stream_missing_completion");
    return { normalized: mapAI21ToGatewayChat(final, requestId), firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const key = keyInfo.key;
    const { canonical, adapterPayload } = buildAdapterPayload(ChatCompletionsSchema, args.body, ["usage", "meta"]);
    const modifiedBody: ChatCompletionsRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        stream: true,
    };
    const req = mapGatewayToAI21Chat(modifiedBody);
    const res = await fetch(`${BASE_URL}/studio/v1/chat/completions`, {
        method: "POST",
        headers: baseHeaders(key),
        body: JSON.stringify(req),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`ai21_api_error: ${res.status} - ${errorText}`);
    }

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("request-id") || undefined,
        finish_reason: null,
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

    const json = await res.json();
    const normalized = mapAI21ToGatewayChat(json, args.meta.requestId);

    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }

    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}









