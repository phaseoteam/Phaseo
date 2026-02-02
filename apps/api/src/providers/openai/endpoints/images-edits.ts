// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { ImagesEditSchema, type ImagesEditRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const { adapterPayload } = buildAdapterPayload(ImagesEditSchema, args.body, ["meta", "usage"]);
    const body: ImagesEditRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const res = await fetch(openAICompatUrl(args.providerId, "/images/edits"), {
        method: "POST",
        headers: openAICompatHeaders(args.providerId, keyInfo.key),
        body: JSON.stringify(body),
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    const normalized = await res.clone().json().catch(() => undefined);

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

