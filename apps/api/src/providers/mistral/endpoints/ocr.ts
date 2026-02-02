// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

// Mistral OCR endpoint - Uses Pixtral vision model for OCR
import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { OcrSchema, type OcrRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";
import { computeBill } from "@pipeline/pricing/engine";

/**
 * Mistral OCR using Pixtral vision model
 * Converts OCR requests to chat completions with vision
 */
export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(OcrSchema, args.body, []).adapterPayload as OcrRequest;

    // Prepare image content
    const imageContent = adapterPayload.image.startsWith("http")
        ? { type: "image_url", image_url: { url: adapterPayload.image } }
        : { type: "image_url", image_url: { url: adapterPayload.image } }; // Base64 also uses image_url format

    // Convert OCR request to Mistral chat format with vision
    const chatRequest = {
        model: args.providerModelSlug || adapterPayload.model || "pixtral-12b-2409",
        messages: [
            {
                role: "user",
                content: [
                    imageContent,
                    {
                        type: "text",
                        text: adapterPayload.language
                            ? `Extract all text from this image. The text is in ${adapterPayload.language}. Return only the extracted text.`
                            : "Extract all text from this image. Return only the extracted text.",
                    },
                ],
            },
        ],
        max_tokens: 4096,
    };

    const res = await fetch(openAICompatUrl(args.providerId, "/chat/completions"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(chatRequest),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    const json = await res.clone().json().catch(() => null);

    // Extract OCR text from chat response
    const ocrText = json?.choices?.[0]?.message?.content || "";
    const normalized = {
        text: ocrText,
        model: json?.model || adapterPayload.model,
    };

    // Calculate pricing
    if (json?.usage) {
        const pricedUsage = computeBill(json.usage, args.pricingCard);
        bill.cost_cents = pricedUsage.pricing.total_cents;
        bill.currency = pricedUsage.pricing.currency;
        bill.usage = pricedUsage;
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

