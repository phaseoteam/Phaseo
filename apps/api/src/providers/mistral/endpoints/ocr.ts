// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// Mistral OCR endpoint - Uses Mistral's native /ocr API.
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { OcrSchema, type OcrRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { computeBill } from "@pipeline/pricing/engine";

function normalizeImageUrl(image: string): string {
    const trimmed = image.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:")) {
        return trimmed;
    }
    return `data:image/jpeg;base64,${trimmed}`;
}

function extractOcrText(json: any): string {
    if (typeof json?.text === "string" && json.text.trim().length > 0) {
        return json.text;
    }

    const pages = Array.isArray(json?.pages) ? json.pages : [];
    if (!pages.length) return "";

    const parts = pages
        .map((page: any) => {
            if (typeof page?.markdown === "string") return page.markdown;
            if (typeof page?.text === "string") return page.text;
            return "";
        })
        .filter((value: string) => value.length > 0);

    return parts.join("\n\n");
}

function buildUsageMeters(json: any): Record<string, number> {
    const pagesProcessed = Number(json?.usage_info?.pages_processed ?? json?.usageInfo?.pagesProcessed ?? 0);
    const docSizeBytes = Number(json?.usage_info?.doc_size_bytes ?? json?.usageInfo?.docSizeBytes ?? 0);

    return {
        requests: 1,
        ...(Number.isFinite(pagesProcessed) && pagesProcessed > 0 ? { pages_processed: pagesProcessed } : {}),
        ...(Number.isFinite(docSizeBytes) && docSizeBytes > 0 ? { doc_size_bytes: docSizeBytes } : {}),
    };
}

/**
 * Mistral OCR via native /ocr endpoint.
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(OcrSchema, args.body, []).adapterPayload as OcrRequest;

    const ocrRequest = {
        model: args.providerModelSlug || adapterPayload.model || "mistral-ocr-latest",
        document: {
            type: "image_url",
            image_url: normalizeImageUrl(adapterPayload.image),
        },
    };

    const res = await fetch(openAICompatUrl(args.providerId, "/ocr"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(ocrRequest),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id") || res.headers.get("request-id"),
        finish_reason: null,
    };

    const json = await res.clone().json().catch(() => null);
    const usageMeters = buildUsageMeters(json);

    if (args.pricingCard) {
        const pricedUsage = computeBill(usageMeters, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }

    const normalized = {
        text: extractOcrText(json),
        model: json?.model || adapterPayload.model,
        usage: usageMeters,
        rawResponse: json,
    };

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}
