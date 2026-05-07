type SupportedAudioFormat = "mp3" | "wav" | "pcm";

type EstimatedTtsUsage = {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	input_text_tokens: number;
	output_audio_tokens: number;
	output_audio_seconds?: number;
	input_characters: number;
	requests: 1;
};

function estimateTextTokensFromChars(chars: number): number {
	if (!Number.isFinite(chars) || chars <= 0) return 0;
	return Math.max(1, Math.ceil(chars / 4));
}

function parsePcmDurationSeconds(bytes: Uint8Array, contentType: string): number | undefined {
	const rateMatch = /rate\s*=\s*(\d+)/i.exec(contentType);
	const channelsMatch = /channels\s*=\s*(\d+)/i.exec(contentType);
	const sampleRate = rateMatch ? Number(rateMatch[1]) : undefined;
	const channels = channelsMatch ? Number(channelsMatch[1]) : 1;
	if (!sampleRate || !Number.isFinite(sampleRate) || sampleRate <= 0) return undefined;
	if (!Number.isFinite(channels) || channels <= 0) return undefined;
	const bytesPerSample = 2; // OpenAI PCM/L16 is 16-bit.
	return bytes.length / (sampleRate * channels * bytesPerSample);
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
	let fmtChannels: number | undefined;
	let fmtSampleRate: number | undefined;
	let fmtBitsPerSample: number | undefined;
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
			fmtChannels = view.getUint16(chunkDataOffset + 2, true);
			fmtSampleRate = view.getUint32(chunkDataOffset + 4, true);
			fmtBitsPerSample = view.getUint16(chunkDataOffset + 14, true);
		} else if (chunkId === "data") {
			dataSize = Math.min(chunkSize, Math.max(0, bytes.length - chunkDataOffset));
			break;
		}

		const next = offset + 8 + chunkSize + (chunkSize % 2);
		if (next <= offset || next > bytes.length) break;
		offset = next;
	}

	if (!fmtChannels || !fmtSampleRate || !fmtBitsPerSample || dataSize == null) return undefined;
	const bytesPerSecond = fmtSampleRate * fmtChannels * (fmtBitsPerSample / 8);
	if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return undefined;
	return dataSize / bytesPerSecond;
}

function parseSynchsafeInt(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] ?? 0) & 0x7f) * 0x200000 +
		((bytes[offset + 1] ?? 0) & 0x7f) * 0x4000 +
		((bytes[offset + 2] ?? 0) & 0x7f) * 0x80 +
		((bytes[offset + 3] ?? 0) & 0x7f)
	);
}

function parseMp3DurationSeconds(bytes: Uint8Array): number | undefined {
	if (bytes.length < 4) return undefined;

	let offset = 0;
	if (
		bytes.length >= 10 &&
		bytes[0] === 0x49 &&
		bytes[1] === 0x44 &&
		bytes[2] === 0x33
	) {
		offset = 10 + parseSynchsafeInt(bytes, 6);
	}

	const bitrateTable = {
		v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
		v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
		v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
		v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
		v2l2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
	};
	const sampleRateTable = {
		3: [44100, 48000, 32000],
		2: [22050, 24000, 16000],
		0: [11025, 12000, 8000],
	} as const;

	for (let i = offset; i + 4 <= bytes.length; i += 1) {
		if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) continue;

		const versionBits = (bytes[i + 1] >> 3) & 0x03;
		const layerBits = (bytes[i + 1] >> 1) & 0x03;
		const bitrateIndex = (bytes[i + 2] >> 4) & 0x0f;
		const sampleRateIndex = (bytes[i + 2] >> 2) & 0x03;
		const paddingBit = (bytes[i + 2] >> 1) & 0x01;
		const channelMode = (bytes[i + 3] >> 6) & 0x03;

		if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || sampleRateIndex === 3) {
			continue;
		}

		const sampleRates = sampleRateTable[versionBits as 0 | 2 | 3];
		const sampleRate = sampleRates?.[sampleRateIndex];
		if (!sampleRate) continue;

		const versionIsMpeg1 = versionBits === 3;
		const layer = 4 - layerBits; // 1, 2, 3
		let bitrateKbps = 0;
		if (layer === 1) {
			bitrateKbps = (versionIsMpeg1 ? bitrateTable.v1l1 : bitrateTable.v2l1)[bitrateIndex] ?? 0;
		} else if (layer === 2) {
			bitrateKbps = (versionIsMpeg1 ? bitrateTable.v1l2 : bitrateTable.v2l2)[bitrateIndex] ?? 0;
		} else {
			bitrateKbps = (versionIsMpeg1 ? bitrateTable.v1l3 : bitrateTable.v2l2)[bitrateIndex] ?? 0;
		}
		if (!bitrateKbps) continue;

		const bitrate = bitrateKbps * 1000;
		const samplesPerFrame =
			layer === 1
				? 384
				: layer === 2
					? 1152
					: versionIsMpeg1
						? 1152
						: 576;

		const sideInfoSize =
			layer === 3
				? versionIsMpeg1
					? channelMode === 3 ? 17 : 32
					: channelMode === 3 ? 9 : 17
				: 0;
		const xingOffset = i + 4 + sideInfoSize;
		if (xingOffset + 8 <= bytes.length) {
			const tag = String.fromCharCode(
				bytes[xingOffset],
				bytes[xingOffset + 1],
				bytes[xingOffset + 2],
				bytes[xingOffset + 3],
			);
			if (tag === "Xing" || tag === "Info") {
				const flags = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(xingOffset + 4, false);
				if ((flags & 0x1) !== 0 && xingOffset + 12 <= bytes.length) {
					const frames = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(xingOffset + 8, false);
					if (Number.isFinite(frames) && frames > 0) {
						return (frames * samplesPerFrame) / sampleRate;
					}
				}
			}
		}

		let trailingTagBytes = 0;
		if (
			bytes.length >= 128 &&
			bytes[bytes.length - 128] === 0x54 &&
			bytes[bytes.length - 127] === 0x41 &&
			bytes[bytes.length - 126] === 0x47
		) {
			trailingTagBytes = 128;
		}
		const audioBytes = Math.max(0, bytes.length - i - trailingTagBytes);
		if (audioBytes <= 0) return undefined;
		return (audioBytes * 8) / bitrate;
	}

	return undefined;
}

function detectAudioFormat(
	bytes: Uint8Array,
	contentType: string | null,
	responseFormat?: string,
): SupportedAudioFormat | undefined {
	const normalizedFormat = String(responseFormat ?? "").trim().toLowerCase();
	if (normalizedFormat === "mp3") return "mp3";
	if (normalizedFormat === "wav") return "wav";
	if (normalizedFormat === "pcm") return "pcm";

	const normalizedContentType = String(contentType ?? "").trim().toLowerCase();
	if (normalizedContentType.includes("audio/wav") || normalizedContentType.includes("audio/x-wav")) return "wav";
	if (normalizedContentType.includes("audio/mpeg") || normalizedContentType.includes("audio/mp3")) return "mp3";
	if (normalizedContentType.includes("audio/l16") || normalizedContentType.includes("audio/pcm")) return "pcm";

	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x41 &&
		bytes[10] === 0x56 &&
		bytes[11] === 0x45
	) {
		return "wav";
	}
	if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
		return "mp3";
	}

	return undefined;
}

function roundDurationSeconds(value: number | undefined): number | undefined {
	if (!Number.isFinite(value as number) || (value as number) <= 0) return undefined;
	return Math.round((value as number) * 1000) / 1000;
}

export function estimateOpenAITtsUsage(args: {
	input: string;
	instructions?: string;
	bytes: Uint8Array;
	contentType: string | null;
	responseFormat?: string;
}): EstimatedTtsUsage {
	const inputText = [args.instructions, args.input].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n");
	const inputCharacters = inputText.length;
	const inputTextTokens = estimateTextTokensFromChars(inputCharacters);

	const format = detectAudioFormat(args.bytes, args.contentType, args.responseFormat);
	let outputAudioSeconds: number | undefined;
	if (format === "wav") {
		outputAudioSeconds = parseWavDurationSeconds(args.bytes);
	} else if (format === "pcm") {
		outputAudioSeconds = parsePcmDurationSeconds(args.bytes, String(args.contentType ?? ""));
	} else if (format === "mp3") {
		outputAudioSeconds = parseMp3DurationSeconds(args.bytes);
	}
	outputAudioSeconds = roundDurationSeconds(outputAudioSeconds);

	const outputAudioTokens = outputAudioSeconds != null
		? Math.max(1, Math.round(outputAudioSeconds * 20))
		: 0;
	const totalTokens = inputTextTokens + outputAudioTokens;

	return {
		inputTokens: inputTextTokens,
		outputTokens: outputAudioTokens,
		totalTokens,
		input_text_tokens: inputTextTokens,
		output_audio_tokens: outputAudioTokens,
		...(outputAudioSeconds != null ? { output_audio_seconds: outputAudioSeconds } : {}),
		input_characters: inputCharacters,
		requests: 1,
	};
}
