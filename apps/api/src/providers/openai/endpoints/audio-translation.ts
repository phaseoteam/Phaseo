// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranslationSchema, type AudioTranslationRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatKey } from "../../openai-compatible/config";

function normalizeModelName(model?: string | null): string {
    if (!model) return "";
    const value = model.trim();
    if (!value) return "";
    const parts = value.split("/");
    return parts[parts.length - 1] || value;
}

function defaultTranslationResponseFormat(model?: string | null): string {
    const normalized = normalizeModelName(model).toLowerCase();
    if (normalized.includes("transcribe")) return "json";
    return "verbose_json";
}

async function parseAudioTextPayload(response: Response): Promise<Record<string, any> | undefined> {
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
        return await response.clone().json().catch(() => undefined);
    }
    const text = await response.clone().text().catch(() => "");
    if (!text) return undefined;
    return { text };
}


export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const keyInfo = await resolveOpenAICompatKey(args);
    const adapterPayload = buildAdapterPayload(AudioTranslationSchema, args.body, []).adapterPayload as AudioTranslationRequest;
    const body: AudioTranslationRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const form = new FormData();
    form.append("model", body.model);
    const filename = typeof File !== "undefined" && body.file instanceof File && body.file.name
        ? body.file.name
        : "audio";
    form.append("file", body.file, filename);
    if (body.prompt) form.append("prompt", body.prompt);
    if (typeof body.temperature === "number") form.append("temperature", String(body.temperature));
    form.append("response_format", body.response_format ?? defaultTranslationResponseFormat(body.model));

    const headers = openAICompatHeaders(args.providerId, keyInfo.key);
    delete (headers as any)["Content-Type"];

    const res = await fetch(openAICompatUrl(args.providerId, "/audio/translations"), {
        method: "POST",
        headers,
        body: form,
    });

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
    };

    const normalized = await parseAudioTextPayload(res);

    return {
        kind: "completed",
        upstream: res,
        bill,
        normalized,
        keySource: keyInfo.source,
        byokKeyId: keyInfo.byokId,
    };
}

