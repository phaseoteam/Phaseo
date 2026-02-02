// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { ProviderExecuteArgs, AdapterResult } from "../../types";
import { EmbeddingsSchema, type EmbeddingsRequest } from "@core/schemas";
import { sanitizePayload } from "../../utils";
import { computeBill } from "@pipeline/pricing/engine";
import { azureDeployment, azureHeaders, azureUrl, resolveAzureConfig, resolveAzureKey } from "../config";

function mapGatewayToAzureEmbeddings(body: EmbeddingsRequest) {
    return {
        input: body.input,
        model: body.model,
        encoding_format: body.encoding_format,
        dimensions: body.dimensions,
        user: body.user,
    };
}

function mapAzureToGatewayEmbeddings(json: any): any {
    return {
        object: json.object,
        data: json.data,
        model: json.model,
        usage: json.usage,
    };
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveAzureKey(args);
    const sanitizedBody = sanitizePayload(EmbeddingsSchema, args.body);
    const modifiedBody: EmbeddingsRequest = {
        ...sanitizedBody,
        model: args.providerModelSlug || args.model,
    };
    const req = mapGatewayToAzureEmbeddings(modifiedBody);
    const config = resolveAzureConfig();
    const deployment = azureDeployment(args);
    const url = azureUrl(`openai/deployments/${deployment}/embeddings`, config.apiVersion, config.baseUrl);

    const res = await fetch(url, {
        method: "POST",
        headers: azureHeaders(keyInfo.key),
        body: JSON.stringify(req),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    const json = await res.clone().json().catch(() => null);
    const normalized = json ? mapAzureToGatewayEmbeddings(json) : undefined;

    if (normalized?.usage) {
        const pricedUsage = computeBill(normalized.usage, args.pricingCard);
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

