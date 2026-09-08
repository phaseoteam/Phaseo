// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranslationSchema, type AudioTranslationRequest } from "@core/schemas";
import { buildAdapterPayload } from "../../utils";
import { resolveOpenAITransport } from "../../shared/openai-transport";
import { upstreamTestHeaders } from "@providers/shared/testing";
import { estimateOpenAiSpeechToTextUsage, mergeSpeechToTextUsage } from "./audio-transcription-usage";

function normalizeModelName(model?: string | null): string {
    if (!model) return "";
    const value = model.trim();
    if (!value) return "";
    const parts = value.split("/");
    return parts[parts.length - 1] || value;
}

function defaultTranslationResponseFormat(): string {
    return "json";
}

function extensionForAudioMimeType(mimeType?: string): string {
    switch ((mimeType || "").toLowerCase().split(";", 1)[0]) {
        case "audio/flac": return "flac";
        case "audio/mpeg": return "mp3";
        case "audio/mp4":
        case "video/mp4": return "mp4";
        case "audio/mpga": return "mpga";
        case "audio/x-m4a":
        case "audio/m4a": return "m4a";
        case "audio/ogg":
        case "application/ogg": return "ogg";
        case "audio/wav":
        case "audio/x-wav": return "wav";
        case "audio/webm":
        case "video/webm": return "webm";
        default: return "wav";
    }
}

function invalidParameterResponse(param: string, message: string): Response {
    return new Response(
        JSON.stringify({ error: { type: "invalid_request_error", message, param } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
    );
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

function normalizeAudioTextUsage(payload: Record<string, any> | undefined): Record<string, any> | undefined {
    const usage = payload?.usage;
    if (!usage || typeof usage !== "object") return undefined;
    return usage as Record<string, any>;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const { keyInfo, url, headers, deployment } = resolveOpenAITransport(args, "/audio/translations", upstreamTestHeaders(args.meta));
    const adapterPayload = buildAdapterPayload(AudioTranslationSchema, args.body, []).adapterPayload as AudioTranslationRequest;
    const body: AudioTranslationRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const modelName = normalizeModelName(body.model).toLowerCase();
    const responseFormat = body.response_format ?? defaultTranslationResponseFormat();
    const isOpenAI = args.providerId === "openai" || args.providerId === "openai-eu";
    if (isOpenAI && modelName !== "whisper-1") {
        return {
            kind: "completed",
            upstream: invalidParameterResponse("model", "OpenAI audio translations support only whisper-1."),
            bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }
    if (modelName === "whisper-1" && !new Set(["json", "text", "srt", "verbose_json", "vtt"]).has(responseFormat)) {
        return {
            kind: "completed",
            upstream: invalidParameterResponse(
                "response_format",
                `whisper-1 translations do not support response_format="${responseFormat}".`,
            ),
            bill: { cost_cents: 0, currency: "USD", usage: undefined, upstream_id: null, finish_reason: null },
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }

    const form = new FormData();
    form.append("model", deployment || body.model);
    const filename = typeof File !== "undefined" && body.file instanceof File && body.file.name
        ? body.file.name
        : `audio.${extensionForAudioMimeType(body.file.type)}`;
    form.append("file", body.file, filename);
    if (body.prompt) form.append("prompt", body.prompt);
    if (typeof body.temperature === "number") form.append("temperature", String(body.temperature));
    form.append("response_format", responseFormat);

    delete (headers as any)["Content-Type"];

    const res = await (args.upstreamTiming?.fetch ?? fetch)(url, {
        method: "POST",
        headers,
        body: form,
    });

    const normalized = await parseAudioTextPayload(res);
    let usage = normalizeAudioTextUsage(normalized);
    if (res.ok) {
        const estimated = await estimateOpenAiSpeechToTextUsage({
            file: body.file,
            prompt: body.prompt,
            text: typeof normalized?.text === "string" ? normalized.text : undefined,
        });
        usage = mergeSpeechToTextUsage(usage, estimated);
        if (normalized && typeof normalized === "object") {
            normalized.usage = usage;
        }
    }

    const bill = {
        cost_cents: 0,
        currency: "USD" as const,
        usage: usage as any,
        upstream_id: res.headers.get("x-request-id"),
        finish_reason: null,
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
