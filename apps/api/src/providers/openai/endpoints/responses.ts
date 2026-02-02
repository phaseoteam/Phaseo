// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import type { ResponsesRequest } from "@core/schemas";
import { ResponsesSchema } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



function createBill(res: Response) {
    return {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };
}

function normalizeUsage(usage: any) {
    if (!usage || typeof usage !== "object") return usage;
    const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
    const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
    const totalTokens = typeof usage.total_tokens === "number" ? usage.total_tokens : undefined;
    const cachedRead = typeof usage?.input_tokens_details?.cached_tokens === "number"
        ? usage.input_tokens_details.cached_tokens
        : undefined;
    const cachedWrite = typeof usage?.output_tokens_details?.cached_tokens === "number"
        ? usage.output_tokens_details.cached_tokens
        : undefined;
    const reasoningTokens = typeof usage?.output_tokens_details?.reasoning_tokens === "number"
        ? usage.output_tokens_details.reasoning_tokens
        : undefined;

    return {
        ...usage,
        input_tokens: inputTokens ?? 0,
        output_tokens: outputTokens ?? 0,
        total_tokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
        input_text_tokens: inputTokens ?? 0,
        output_text_tokens: outputTokens ?? 0,
        ...(cachedRead !== undefined ? { cached_read_text_tokens: cachedRead } : {}),
        ...(cachedWrite !== undefined ? { cached_write_text_tokens: cachedWrite } : {}),
        ...(reasoningTokens !== undefined ? { reasoning_tokens: reasoningTokens } : {}),
    };
}

function mapOpenAIResponse(model: string, json: any) {
    const usage = normalizeUsage(json?.usage);
    return {
        ...json,
        model,
        usage,
    };
}

async function bufferResponsesStream(res: Response, args: ProviderExecuteArgs, payload: ResponsesRequest) {
    if (!res.body) throw new Error("openai_stream_missing_body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let finalResponse: any = null;
    let firstFrameMs: number | null = null;
    const t0 = performance.now();

    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (firstFrameMs === null) firstFrameMs = Math.round(performance.now() - t0);
        buf += decoder.decode(value, { stream: true });
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
            if (payload?.response) finalResponse = payload.response;
        }
    }

    if (!finalResponse) {
        throw new Error("openai_stream_missing_response");
    }

    const normalized = mapOpenAIResponse(args.model, finalResponse);
    return { res, normalized, firstFrameMs };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const { canonical, adapterPayload } = buildAdapterPayload(
        ResponsesSchema,
        args.body,
        ["usage", "meta"]
    );

    const payload: ResponsesRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || args.model,
        stream: true, // always stream upstream to capture first-byte latency
    };

    const res = await fetch(openAICompatUrl(args.providerId, "/responses"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(payload),
    });

    const bill = createBill(res);

    if (args.stream) {
        return {
            kind: "stream",
            upstream: res,
            bill,
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const { normalized, firstFrameMs } = await bufferResponsesStream(res, args, payload);
    if (firstFrameMs !== null) args.meta.latency_ms = firstFrameMs;
    if (normalized?.usage) {
        const priced = computeBill(normalized.usage, args.pricingCard);
        bill.cost_cents = priced.pricing.total_cents;
        bill.currency = priced.pricing.currency;
        bill.usage = priced;
    } else if (normalized?.usage !== undefined) {
        bill.usage = normalized.usage;
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

