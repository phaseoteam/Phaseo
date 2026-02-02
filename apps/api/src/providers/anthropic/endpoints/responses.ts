// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import type { ResponsesRequest } from "@core/schemas";
import { ResponsesSchema } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { getBindings } from "@/runtime/env";
import { resolveProviderKey, type ResolvedKey } from "../../keys";
import { computeBill } from "@pipeline/pricing/engine";
import { mapAnthropicToGatewayChat } from "./chat";

const BASE_URL = "https://api.anthropic.com";

function coerceString(value: unknown): string {
    if (typeof value === "string") return value;
    if (value === undefined || value === null) return "";
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function mapGatewayResponsesToAnthropic(body: ResponsesRequest) {
    const inputItems = Array.isArray(body.input_items) ? body.input_items : [];
    const baseInput = body.input ?? null;
    const parts: string[] = [];
    if (baseInput !== null && baseInput !== undefined) {
        parts.push(coerceString(baseInput));
    }
    for (const item of inputItems) {
        parts.push(coerceString(item));
    }

    const userContent = parts.length ? parts.join("\n\n") : "";

    const tools = Array.isArray(body.tools)
        ? body.tools.map((tool: any) => ({
            name: tool?.function?.name ?? tool?.name ?? "function",
            description: tool?.function?.description ?? tool?.description ?? "",
            input_schema: tool?.function?.parameters ?? tool?.parameters ?? { type: "object" },
        }))
        : undefined;

    return {
        model: body.model,
        messages: [{ role: "user", content: userContent }],
        system: body.instructions ?? undefined,
        max_tokens: body.max_output_tokens ?? 1024,
        temperature: body.temperature,
        top_p: body.top_p,
        stream: Boolean(body.stream),
        tools,
    };
}

async function resolveApiKey(args: ProviderExecuteArgs): Promise<ResolvedKey> {
    return resolveProviderKey(args, () => getBindings().ANTHROPIC_API_KEY);
}

async function bufferAnthropicResponsesStream(res: Response, model: string, requestId: string) {
    if (!res.body) throw new Error("anthropic_stream_missing_body");
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
            if (payload?.message) final = payload.message;
            else if (payload?.response) final = payload.response;
        }
    }

    if (!final) throw new Error("anthropic_stream_missing_completion");
    return { normalized: mapAnthropicToGatewayChat(final, requestId), firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveApiKey(args);
    const { canonical, adapterPayload } = buildAdapterPayload(ResponsesSchema, args.body, ["usage", "meta"]);
    const requestPayload = mapGatewayResponsesToAnthropic({
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
        stream: true,
    } as ResponsesRequest);

    const res = await fetch(`${BASE_URL}/v1/messages`, {
        method: "POST",
        headers: {
            "x-api-key": keyInfo.key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestPayload),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("request-id"),
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

    const { normalized, firstFrameMs } = await bufferAnthropicResponsesStream(res, args.model, args.meta.requestId);
    if (firstFrameMs !== null) args.meta.latency_ms = firstFrameMs;

    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }

    return { kind: "completed", upstream: res, bill, normalized, keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
}

