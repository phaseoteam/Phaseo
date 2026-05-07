type EstimatedSpeechToTextUsage = {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    input_audio_tokens: number;
    output_text_tokens: number;
    input_text_tokens?: number;
    input_audio_seconds?: number;
    input_characters?: number;
    requests: 1;
};

function estimateTextTokensFromChars(chars: number): number {
    if (!Number.isFinite(chars) || chars <= 0) return 0;
    return Math.max(1, Math.ceil(chars / 4));
}

function parseWavDurationSeconds(bytes: Uint8Array): number | undefined {
    if (bytes.length < 44) return undefined;
    const isRiff =
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46;
    const isWave =
        bytes[8] === 0x57 &&
        bytes[9] === 0x41 &&
        bytes[10] === 0x56 &&
        bytes[11] === 0x45;
    if (!isRiff || !isWave) return undefined;

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let channels: number | undefined;
    let sampleRate: number | undefined;
    let bitsPerSample: number | undefined;
    let dataSize: number | undefined;
    let offset = 12;

    while (offset + 8 <= bytes.length) {
        const chunkId =
            String.fromCharCode(bytes[offset]) +
            String.fromCharCode(bytes[offset + 1]) +
            String.fromCharCode(bytes[offset + 2]) +
            String.fromCharCode(bytes[offset + 3]);
        const chunkSize = view.getUint32(offset + 4, true);
        const chunkDataOffset = offset + 8;
        if (chunkId === "fmt " && chunkDataOffset + 16 <= bytes.length) {
            channels = view.getUint16(chunkDataOffset + 2, true);
            sampleRate = view.getUint32(chunkDataOffset + 4, true);
            bitsPerSample = view.getUint16(chunkDataOffset + 14, true);
        } else if (chunkId === "data") {
            dataSize = Math.min(chunkSize, Math.max(0, bytes.length - chunkDataOffset));
            break;
        }

        const next = offset + 8 + chunkSize + (chunkSize % 2);
        if (next <= offset || next > bytes.length) break;
        offset = next;
    }

    if (!channels || !sampleRate || !bitsPerSample || dataSize == null) return undefined;
    const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return undefined;
    return dataSize / bytesPerSecond;
}

function roundDurationSeconds(value: number | undefined): number | undefined {
    if (!Number.isFinite(value as number) || (value as number) <= 0) return undefined;
    return Math.round((value as number) * 1000) / 1000;
}

function estimateCompressedAudioDurationSeconds(file: File | Blob, mimeType: string): number | undefined {
    const size = Number((file as any)?.size);
    if (!Number.isFinite(size) || size <= 0) return undefined;

    const normalized = String(mimeType ?? "").toLowerCase();
    const bytesPerSecond = (() => {
        if (normalized.includes("mpeg") || normalized.includes("mp3")) return 16_000;
        if (normalized.includes("mp4") || normalized.includes("m4a") || normalized.includes("aac")) return 20_000;
        if (normalized.includes("ogg") || normalized.includes("opus") || normalized.includes("webm")) return 12_000;
        if (normalized.includes("flac")) return 24_000;
        return undefined;
    })();

    if (!bytesPerSecond || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
        return undefined;
    }

    return size / bytesPerSecond;
}

async function readAudioDurationSeconds(file: File | Blob): Promise<number | undefined> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = String((file as any)?.type ?? "").toLowerCase();
    if (mimeType.includes("wav") || (
        bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x41 &&
        bytes[10] === 0x56 &&
        bytes[11] === 0x45
    )) {
        return roundDurationSeconds(parseWavDurationSeconds(bytes));
    }
    const estimated = roundDurationSeconds(estimateCompressedAudioDurationSeconds(file, mimeType));
    if (estimated != null) {
        return estimated;
    }
    console.warn("[openai-audio] could not infer audio duration for speech-to-text usage fallback", {
        mimeType: mimeType || null,
        size: Number((file as any)?.size ?? 0) || 0,
    });
    return undefined;
}

export function mergeSpeechToTextUsage(
    base: Record<string, any> | undefined,
    estimated: EstimatedSpeechToTextUsage,
): Record<string, any> {
    return {
        ...estimated,
        ...(base ?? {}),
        input_audio_tokens: typeof base?.input_audio_tokens === "number" ? base.input_audio_tokens : estimated.input_audio_tokens,
        output_text_tokens: typeof base?.output_text_tokens === "number" ? base.output_text_tokens : estimated.output_text_tokens,
        ...(typeof estimated.input_text_tokens === "number" && typeof base?.input_text_tokens !== "number"
            ? { input_text_tokens: estimated.input_text_tokens }
            : {}),
        ...(typeof estimated.input_audio_seconds === "number" && typeof base?.input_audio_seconds !== "number"
            ? { input_audio_seconds: estimated.input_audio_seconds }
            : {}),
        ...(typeof estimated.input_characters === "number" && typeof base?.input_characters !== "number"
            ? { input_characters: estimated.input_characters }
            : {}),
        requests: typeof base?.requests === "number" ? base.requests : 1,
        inputTokens: typeof base?.inputTokens === "number" ? base.inputTokens : estimated.inputTokens,
        outputTokens: typeof base?.outputTokens === "number" ? base.outputTokens : estimated.outputTokens,
        totalTokens: typeof base?.totalTokens === "number" ? base.totalTokens : estimated.totalTokens,
    };
}

export async function estimateOpenAiSpeechToTextUsage(args: {
    file: File | Blob;
    prompt?: string;
    text?: string;
}): Promise<EstimatedSpeechToTextUsage> {
    const promptText = typeof args.prompt === "string" ? args.prompt : "";
    const transcriptText = typeof args.text === "string" ? args.text : "";
    const inputTextTokens = promptText ? estimateTextTokensFromChars(promptText.length) : 0;
    const outputTextTokens = transcriptText ? estimateTextTokensFromChars(transcriptText.length) : 0;
    const inputAudioSeconds = await readAudioDurationSeconds(args.file);
    const inputAudioTokens = inputAudioSeconds != null
        ? Math.max(1, Math.round(inputAudioSeconds * 40))
        : 0;
    const inputTokens = inputAudioTokens + inputTextTokens;
    const outputTokens = outputTextTokens;

    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        input_audio_tokens: inputAudioTokens,
        output_text_tokens: outputTextTokens,
        ...(inputTextTokens > 0 ? { input_text_tokens: inputTextTokens } : {}),
        ...(inputAudioSeconds != null ? { input_audio_seconds: inputAudioSeconds } : {}),
        ...(promptText.length > 0 ? { input_characters: promptText.length } : {}),
        requests: 1,
    };
}
