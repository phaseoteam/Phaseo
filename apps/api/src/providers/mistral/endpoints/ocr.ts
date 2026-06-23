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

function isPlainObject(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pickOption(source: Record<string, any>, snakeKey: string, camelKey?: string): unknown {
    if (source[snakeKey] !== undefined) return source[snakeKey];
    if (camelKey && source[camelKey] !== undefined) return source[camelKey];
    return undefined;
}

function buildMistralOcrOptions(adapterPayload: Record<string, any>): Record<string, any> {
    const providerParams = isPlainObject(adapterPayload.provider_params)
        ? adapterPayload.provider_params
        : {};
    const nestedProviderParams = isPlainObject(providerParams.mistral)
        ? providerParams.mistral
        : {};
    const mistralParams = isPlainObject(adapterPayload.mistral)
        ? adapterPayload.mistral
        : {};
    const source = { ...providerParams, ...nestedProviderParams, ...mistralParams };

    const mapped = {
        bbox_annotation_format: pickOption(source, "bbox_annotation_format", "bboxAnnotationFormat"),
        confidence_scores_granularity: pickOption(source, "confidence_scores_granularity", "confidenceScoresGranularity"),
        document_annotation_format: pickOption(source, "document_annotation_format", "documentAnnotationFormat"),
        document_annotation_prompt: pickOption(source, "document_annotation_prompt", "documentAnnotationPrompt"),
        extract_footer: pickOption(source, "extract_footer", "extractFooter"),
        extract_header: pickOption(source, "extract_header", "extractHeader"),
        image_limit: pickOption(source, "image_limit", "imageLimit"),
        image_min_size: pickOption(source, "image_min_size", "imageMinSize"),
        include_blocks: pickOption(source, "include_blocks", "includeBlocks"),
        include_image_base64: pickOption(source, "include_image_base64", "includeImageBase64"),
        pages: pickOption(source, "pages"),
        table_format: pickOption(source, "table_format", "tableFormat"),
    };

    return Object.fromEntries(
        Object.entries(mapped).filter(([, value]) => value !== undefined),
    );
}

function hasAnnotationRequest(ocrOptions: Record<string, any>): boolean {
    return ocrOptions.document_annotation_format != null || ocrOptions.bbox_annotation_format != null;
}

function buildUsageMeters(json: any): Record<string, any> {
    const pagesProcessed = Number(json?.usage_info?.pages_processed ?? json?.usageInfo?.pagesProcessed ?? 0);
    const docSizeBytes = Number(json?.usage_info?.doc_size_bytes ?? json?.usageInfo?.docSizeBytes ?? 0);

    return {
        requests: 1,
        ...(Number.isFinite(pagesProcessed) && pagesProcessed > 0 ? { input_pages: pagesProcessed, pages_processed: pagesProcessed } : {}),
        ...(Number.isFinite(docSizeBytes) && docSizeBytes > 0 ? { doc_size_bytes: docSizeBytes } : {}),
    };
}

/**
 * Mistral OCR via native /ocr endpoint.
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(OcrSchema, args.body, []).adapterPayload as OcrRequest;
    const ocrOptions = buildMistralOcrOptions(adapterPayload as Record<string, any>);
    const annotated = hasAnnotationRequest(ocrOptions);

    const ocrRequest = {
        model: args.providerModelSlug || adapterPayload.model || "mistral-ocr-latest",
        document: {
            type: "image_url",
            image_url: normalizeImageUrl(adapterPayload.image),
        },
        ...ocrOptions,
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
    const pricingUsage = annotated
        ? { ...usageMeters, ocr_params: { annotations: true } }
        : usageMeters;

    if (args.pricingCard) {
        const pricedUsage = computeBill(pricingUsage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
    }

    const normalized = {
        text: extractOcrText(json),
        model: json?.model || adapterPayload.model,
        usage: pricingUsage,
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
