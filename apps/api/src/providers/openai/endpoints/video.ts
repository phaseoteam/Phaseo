// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { VideoGenerationSchema, type VideoGenerationRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";



export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(VideoGenerationSchema, args.body, []).adapterPayload as VideoGenerationRequest;
    const body: VideoGenerationRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const seconds = body.seconds ?? body.duration_seconds ?? body.duration;
    const size = body.size;

    const sendAsMultipart = Boolean(body.input_reference);
    const headers = openAICompatHeaders(args.providerId, keyInfo.key);
    let requestBody: BodyInit;

    if (sendAsMultipart) {
        const form = new FormData();
        form.append("model", body.model);
        form.append("prompt", body.prompt);
        if (seconds != null) form.append("seconds", String(seconds));
        if (size) form.append("size", size);

        const ref = body.input_reference ?? "";
        let fileBlob: Blob | null = null;
        let filename = "reference";
        let mimeType = body.input_reference_mime_type ?? "application/octet-stream";

        const dataUrlMatch = ref.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
            mimeType = dataUrlMatch[1] ?? mimeType;
            const bytes = Uint8Array.from(atob(dataUrlMatch[2]), (c) => c.charCodeAt(0));
            fileBlob = new Blob([bytes], { type: mimeType });
        } else if (ref.startsWith("http://") || ref.startsWith("https://")) {
            const fetched = await fetch(ref);
            if (!fetched.ok) {
                return {
                    kind: "completed",
                    upstream: fetched,
                    bill: { cost_cents: 0, currency: "USD" },
                };
            }
            fileBlob = await fetched.blob();
            mimeType = fileBlob.type || mimeType;
            const urlParts = ref.split("/");
            filename = urlParts[urlParts.length - 1] || filename;
        } else if (ref.length) {
            const bytes = Uint8Array.from(atob(ref), (c) => c.charCodeAt(0));
            fileBlob = new Blob([bytes], { type: mimeType });
        }

        if (fileBlob) {
            form.append("input_reference", fileBlob, filename);
        }
        requestBody = form;
        // Let fetch set the multipart boundary
        delete (headers as any)["Content-Type"];
    } else {
        requestBody = JSON.stringify({
            model: body.model,
            prompt: body.prompt,
            ...(seconds != null ? { seconds } : {}),
            ...(size ? { size } : {}),
        });
    }

    const res = await fetch(openAICompatUrl(args.providerId, "/videos"), {
        method: "POST",
        headers,
        body: requestBody,
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

