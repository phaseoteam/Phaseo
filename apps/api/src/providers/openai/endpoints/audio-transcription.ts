// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import type { AdapterResult, ProviderExecuteArgs } from "../../types";
import { AudioTranscriptionSchema, type AudioTranscriptionRequest } from "@core/schemas";
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

function defaultTranscriptionResponseFormat(model?: string | null): string {
    const normalized = normalizeModelName(model).toLowerCase();
    if (normalized === "whisper-1") return "verbose_json";
    if (normalized.includes("transcribe")) return "json";
    return "verbose_json";
}

function invalidParameterResponse(param: string, message: string): Response {
    return new Response(
        JSON.stringify({ error: { type: "invalid_request_error", message, param } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
    );
}

function emptyBill() {
    return {
        cost_cents: 0,
        currency: "USD" as const,
        usage: undefined as any,
        upstream_id: null,
        finish_reason: null,
    };
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
    const usage = payload?.usage && typeof payload.usage === "object" ? payload.usage : {};
    const seconds = typeof usage.seconds === "number"
        ? usage.seconds
        : typeof usage.duration === "number"
            ? usage.duration
            : typeof payload?.duration === "number" ? payload.duration : undefined;
    if (Object.keys(usage).length === 0 && seconds === undefined) return undefined;
    return {
        ...usage,
        ...(typeof seconds === "number" ? { input_audio_seconds: seconds } : {}),
    } as Record<string, any>;
}

export async function collectTranscriptionStreamUsage(stream: ReadableStream<Uint8Array>): Promise<Record<string, any> | undefined> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: Record<string, any> | undefined;
    const consume = (frame: string) => {
        const data = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
        if (!data || data === "[DONE]") return;
        try {
            const event = JSON.parse(data);
            if (event?.usage && typeof event.usage === "object") usage = event.usage;
        } catch {
            // The client still receives malformed upstream frames unchanged.
        }
    };
    while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let boundary: number;
        while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
            consume(frame);
        }
        if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    return usage;
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
    const { keyInfo, url, headers, deployment } = resolveOpenAITransport(args, "/audio/transcriptions", upstreamTestHeaders(args.meta));
    const adapterPayload = buildAdapterPayload(AudioTranscriptionSchema, args.body, []).adapterPayload as AudioTranscriptionRequest;
    const body: AudioTranscriptionRequest = {
        ...adapterPayload,
        model: args.providerModelSlug || adapterPayload.model,
    };

    const modelName = normalizeModelName(body.model).toLowerCase();
    const responseFormat = body.response_format ?? (args.providerId === "scaleway" ? "json" : defaultTranscriptionResponseFormat(body.model));
    const isGptTranscribe = modelName.includes("transcribe") && modelName !== "whisper-1";
    const isDiarize = modelName.includes("transcribe-diarize");
	const supportsLogprobs = modelName === "gpt-4o-transcribe" ||
		modelName === "gpt-4o-mini-transcribe" ||
		modelName === "gpt-4o-mini-transcribe-2025-12-15";
    const supportedGptFormats = isDiarize
        ? new Set(["json", "text", "diarized_json"])
        : new Set(["json"]);
	if (args.providerId === "deepinfra") {
		const unsupported = ["include", "chunking_strategy", "languages", "keywords", "diarize", "known_speaker_names", "known_speaker_references"].find(name => (body as any)[name] != null);
		const param = body.stream === true ? "stream" : unsupported ?? (!new Set(["json", "verbose_json", "text", "srt", "vtt"]).has(responseFormat) ? "response_format" : undefined);
		if (param) return { kind: "completed", upstream: invalidParameterResponse(param, `DeepInfra transcription does not support ${param}.`), bill: emptyBill(), keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	}
	if (args.providerId === "scaleway") {
		if (responseFormat !== "json") {
			return {
				kind: "completed",
				upstream: invalidParameterResponse("response_format", "Scaleway transcription supports only response_format=\"json\"."),
				bill: emptyBill(),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
		if ((body.timestamp_granularities?.length ?? 0) > 0 || (body.include?.length ?? 0) > 0 || body.chunking_strategy !== undefined) {
			const param = (body.timestamp_granularities?.length ?? 0) > 0
				? "timestamp_granularities"
				: (body.include?.length ?? 0) > 0 ? "include" : "chunking_strategy";
			return {
				kind: "completed",
				upstream: invalidParameterResponse(param, `Scaleway transcription does not support ${param}.`),
				bill: emptyBill(),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
	}
    if (args.providerId === "ovhcloud") {
        const supportedFormats = new Set(["json", "text", "verbose_json"]);
        if (!supportedFormats.has(responseFormat)) {
            return {
                kind: "completed",
                upstream: invalidParameterResponse(
                    "response_format",
                    `OVHcloud Whisper supports response_format="json", "text", or "verbose_json"; SRT and VTT are not yet supported.`,
                ),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
        if (body.stream === true) {
            return {
                kind: "completed",
                upstream: invalidParameterResponse("stream", "OVHcloud Whisper does not support streaming transcription."),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
        if ((body.include?.length ?? 0) > 0) {
            return {
                kind: "completed",
                upstream: invalidParameterResponse("include", "OVHcloud Whisper does not support include or logprobs."),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
        if ((body.timestamp_granularities?.length ?? 0) > 0 && responseFormat !== "verbose_json") {
            return {
                kind: "completed",
                upstream: invalidParameterResponse("timestamp_granularities", "OVHcloud Whisper timestamps require response_format=\"verbose_json\"."),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
    }
    if (isGptTranscribe && !supportedGptFormats.has(responseFormat)) {
        return {
            kind: "completed",
            upstream: invalidParameterResponse(
                "response_format",
                isDiarize
                    ? `${modelName} supports response_format="json", "text", or "diarized_json".`
                    : `${modelName} only supports response_format="json".`,
            ),
            bill: emptyBill(),
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }
    if (isGptTranscribe && (body.timestamp_granularities?.length ?? 0) > 0) {
        return {
            kind: "completed",
            upstream: invalidParameterResponse(
                "timestamp_granularities",
                `${modelName} does not support timestamp_granularities; use whisper-1 with verbose_json.`,
            ),
            bill: emptyBill(),
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }
    if (isDiarize && body.prompt) {
        return {
            kind: "completed",
            upstream: invalidParameterResponse("prompt", `${modelName} does not support prompt.`),
            bill: emptyBill(),
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }
    if (isDiarize && (body.include?.length ?? 0) > 0) {
        return {
            kind: "completed",
            upstream: invalidParameterResponse("include", `${modelName} does not support include.`),
            bill: emptyBill(),
            keySource: keyInfo.source,
            byokKeyId: keyInfo.byokId,
        };
    }
    if (isGptTranscribe && !isDiarize) {
        const unsupported = body.include?.find((entry) => entry !== "logprobs");
        if (unsupported) {
            return {
                kind: "completed",
                upstream: invalidParameterResponse("include", `${modelName} only supports include=["logprobs"].`),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
		if ((body.include?.length ?? 0) > 0 && !supportsLogprobs) {
			return {
				kind: "completed",
				upstream: invalidParameterResponse("include", `${modelName} does not support include; log probabilities require a GPT-4o transcription model.`),
				bill: emptyBill(),
				keySource: keyInfo.source,
				byokKeyId: keyInfo.byokId,
			};
		}
    }
    if (modelName === "whisper-1") {
        const supportedFormats = new Set(["json", "text", "srt", "verbose_json", "vtt"]);
        if (!supportedFormats.has(responseFormat)) {
            return {
                kind: "completed",
                upstream: invalidParameterResponse(
                    "response_format",
                    `whisper-1 does not support response_format="${responseFormat}".`,
                ),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
        if ((body.include?.length ?? 0) > 0) {
            return {
                kind: "completed",
                upstream: invalidParameterResponse(
                    "include",
                    "whisper-1 does not support include; log probabilities require a GPT transcription model.",
                ),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
        if ((body.timestamp_granularities?.length ?? 0) > 0 && responseFormat !== "verbose_json") {
            return {
                kind: "completed",
                upstream: invalidParameterResponse(
                    "timestamp_granularities",
                    "whisper-1 timestamp_granularities require response_format=\"verbose_json\".",
                ),
                bill: emptyBill(),
                keySource: keyInfo.source,
                byokKeyId: keyInfo.byokId,
            };
        }
    }

    const form = new FormData();
    form.append("model", deployment || body.model);
    const filename = typeof File !== "undefined" && body.file instanceof File && body.file.name
        ? body.file.name
        : "audio";
    form.append("file", body.file, filename);
    if (body.language) form.append("language", body.language);
	for (const language of body.languages ?? []) form.append("languages[]", language);
	for (const keyword of body.keywords ?? []) form.append("keywords[]", keyword);
    if (body.prompt) form.append("prompt", body.prompt);
    if (typeof body.temperature === "number") form.append("temperature", String(body.temperature));
    form.append("response_format", responseFormat);
	if (typeof body.stream === "boolean" && args.providerId !== "deepinfra") form.append("stream", String(body.stream));
    if (Array.isArray(body.timestamp_granularities)) {
        for (const entry of body.timestamp_granularities) {
            if (entry === "word" || entry === "segment") {
                form.append(args.providerId === "deepinfra" ? "timestamp_granularities" : "timestamp_granularities[]", entry);
            }
        }
    }
    if (args.providerId === "ovhcloud" && typeof body.diarize === "boolean") {
        form.append("diarize", String(body.diarize));
    }
    if (Array.isArray(body.include)) {
        for (const entry of body.include) {
            if (typeof entry === "string" && entry.trim().length > 0) {
                form.append("include[]", entry);
            }
        }
    }
    if (body.chunking_strategy !== undefined) {
		const chunkingStrategy = args.providerId === "ovhcloud" && typeof body.chunking_strategy === "object"
			? { vad_config: body.chunking_strategy }
			: body.chunking_strategy;
        form.append(
            "chunking_strategy",
            typeof chunkingStrategy === "string"
                ? chunkingStrategy
                : JSON.stringify(chunkingStrategy),
        );
    }
    for (const name of body.known_speaker_names ?? []) {
        form.append("known_speaker_names[]", name);
    }
    for (const reference of body.known_speaker_references ?? []) {
        form.append("known_speaker_references[]", reference);
    }

    delete (headers as any)["Content-Type"];

    const res = await (args.upstreamTiming?.fetch ?? fetch)(url, {
        method: "POST",
        headers,
        body: form,
    });
	const baseBill = {
		cost_cents: 0,
		currency: "USD" as const,
		usage: undefined as any,
		upstream_id: res.headers.get("x-request-id"),
		finish_reason: null,
	};
	if (res.ok && body.stream === true && res.body) {
		const [clientStream, accountingStream] = res.body.tee();
		const usageFinalizer = async () => {
			const upstreamUsage = await collectTranscriptionStreamUsage(accountingStream);
			const estimated = await estimateOpenAiSpeechToTextUsage({ file: body.file, prompt: body.prompt });
			return { ...baseBill, usage: mergeSpeechToTextUsage(upstreamUsage, estimated) };
		};
		return {
			kind: "stream",
			upstream: res,
			stream: clientStream,
			usageFinalizer,
			bill: baseBill,
			keySource: keyInfo.source,
			byokKeyId: keyInfo.byokId,
		};
	}

    const normalized = await parseAudioTextPayload(res);
    if (args.providerId === "deepinfra" && normalized && typeof normalized.input_length_ms === "number" && Number.isFinite(normalized.input_length_ms) && normalized.input_length_ms >= 0) {
        normalized.usage = { ...normalized.usage, seconds: normalized.input_length_ms / 1000 };
    }
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
		...baseBill,
		usage: usage as any,
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
