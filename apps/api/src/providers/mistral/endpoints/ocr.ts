// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// Mistral OCR endpoint - Uses Mistral's native /ocr API.
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { OcrSchema, type OcrRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { computeBillAfterProviderCharge } from "@pipeline/pricing/engine";

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

function buildUsageMeters(json: any, annotated: boolean): Record<string, number> {
    const pagesProcessed = Number(json?.usage_info?.pages_processed ?? json?.usageInfo?.pagesProcessed ?? 0);
    const docSizeBytes = Number(json?.usage_info?.doc_size_bytes ?? json?.usageInfo?.docSizeBytes ?? 0);

    return {
        requests: 1,
        ...(Number.isFinite(pagesProcessed) && pagesProcessed > 0 ? { input_pages: pagesProcessed, pages_processed: pagesProcessed } : {}),
        ...(annotated && Number.isFinite(pagesProcessed) && pagesProcessed > 0 ? { ocr_annotation_pages: pagesProcessed } : {}),
        ...(Number.isFinite(docSizeBytes) && docSizeBytes > 0 ? { doc_size_bytes: docSizeBytes } : {}),
    };
}

/**
 * Mistral OCR via native /ocr endpoint.
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(OcrSchema, args.body, []).adapterPayload as OcrRequest;

    const document = adapterPayload.document ?? {
        type: "image_url" as const,
        image_url: normalizeImageUrl(adapterPayload.image ?? ""),
    };
    const ocrRequest = {
        model: args.providerModelSlug || adapterPayload.model || "mistral-ocr-latest",
        document,
        ...(adapterPayload.pages !== undefined ? { pages: adapterPayload.pages } : {}),
        ...(adapterPayload.include_image_base64 !== undefined ? { include_image_base64: adapterPayload.include_image_base64 } : {}),
        ...(adapterPayload.image_limit !== undefined ? { image_limit: adapterPayload.image_limit } : {}),
        ...(adapterPayload.image_min_size !== undefined ? { image_min_size: adapterPayload.image_min_size } : {}),
        ...(adapterPayload.bbox_annotation_format !== undefined ? { bbox_annotation_format: adapterPayload.bbox_annotation_format } : {}),
        ...(adapterPayload.document_annotation_format !== undefined ? { document_annotation_format: adapterPayload.document_annotation_format } : {}),
        ...(adapterPayload.document_annotation_prompt !== undefined ? { document_annotation_prompt: adapterPayload.document_annotation_prompt } : {}),
        ...(adapterPayload.table_format !== undefined ? { table_format: adapterPayload.table_format } : {}),
        ...(adapterPayload.extract_header !== undefined ? { extract_header: adapterPayload.extract_header } : {}),
        ...(adapterPayload.extract_footer !== undefined ? { extract_footer: adapterPayload.extract_footer } : {}),
        ...(adapterPayload.include_blocks !== undefined ? { include_blocks: adapterPayload.include_blocks } : {}),
        ...(adapterPayload.confidence_scores_granularity !== undefined ? { confidence_scores_granularity: adapterPayload.confidence_scores_granularity } : {}),
    };

    const res = await (args.upstreamTiming?.fetch ?? fetch)(openAICompatUrl(args.providerId, "/ocr"), {
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
    const hasAnnotations = adapterPayload.bbox_annotation_format != null || adapterPayload.document_annotation_format != null;
    const usageMeters = buildUsageMeters(json, hasAnnotations);

    if (args.pricingCard) {
        const pricedUsage = computeBillAfterProviderCharge(usageMeters, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }

    const normalized = {
        text: extractOcrText(json),
        model: json?.model || adapterPayload.model,
        pages: Array.isArray(json?.pages) ? json.pages : undefined,
        document_annotation: json?.document_annotation,
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
