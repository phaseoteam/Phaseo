// Audio duration from container headers, for the formats ElevenLabs Music returns (MP3, Ogg Opus) plus WAV and
// Ogg Vorbis/FLAC/Speex. Used to bill ElevenLabs Music and StepFun transcription. Replaces music-metadata +
// file-type, which added ~440 KiB to the Worker bundle for this one measurement.
// Returns undefined when the bytes are not a format it understands, so callers keep their own fallback.

const MPEG_BITRATES_KBPS: Record<string, number[]> = {
	// [version][layer] → index 1..14
	"1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
	"1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
	"1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
	"2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
	"2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
	"2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MPEG_SAMPLE_RATES: Record<number, number[]> = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

type MpegFrame = { length: number; samples: number; sampleRate: number; bitrateKbps: number; version: 1 | 2 | 25; mono: boolean };

function readMpegFrame(b: Uint8Array, i: number): MpegFrame | null {
	if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return null;
	const versionBits = (b[i + 1] >> 3) & 3; // 0 = 2.5, 2 = 2, 3 = 1
	const layerBits = (b[i + 1] >> 1) & 3; // 1 = III, 2 = II, 3 = I
	const bitrateIndex = b[i + 2] >> 4;
	const rateIndex = (b[i + 2] >> 2) & 3;
	if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
	const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 25;
	const layer = 4 - layerBits;
	const bitrateKbps = MPEG_BITRATES_KBPS[`${version === 1 ? 1 : 2}-${layer}`][bitrateIndex];
	const sampleRate = MPEG_SAMPLE_RATES[version][rateIndex];
	const padding = (b[i + 2] >> 1) & 1;
	const samples = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152;
	const length =
		layer === 1
			? (Math.floor((12 * bitrateKbps * 1000) / sampleRate) + padding) * 4
			: Math.floor(((samples / 8) * bitrateKbps * 1000) / sampleRate) + padding;
	return { length, samples, sampleRate, bitrateKbps, version, mono: (b[i + 3] >> 6) === 3 };
}

const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const ascii = (b: Uint8Array, i: number, s: string) => {
	for (let k = 0; k < s.length; k++) if (b[i + k] !== s.charCodeAt(k)) return false;
	return true;
};

function mp3Duration(b: Uint8Array): number | undefined {
	let start = 0;
	// ID3v2 tags (possibly several), size is syncsafe; a footer adds 10 bytes.
	while (start + 10 <= b.length && ascii(b, start, "ID3")) {
		const size = ((b[start + 6] & 0x7f) << 21) | ((b[start + 7] & 0x7f) << 14) | ((b[start + 8] & 0x7f) << 7) | (b[start + 9] & 0x7f);
		start += 10 + size + (b[start + 5] & 0x10 ? 10 : 0);
	}
	let end = b.length;
	if (end - 128 >= start && ascii(b, end - 128, "TAG")) end -= 128; // ID3v1
	// Find the first frame whose successor is also a frame (guards against a stray 0xFFE sync in tag padding).
	let first = -1;
	for (let i = start; i + 4 <= Math.min(end, start + 65536); i++) {
		const f = readMpegFrame(b, i);
		if (f && (i + f.length >= end || readMpegFrame(b, i + f.length))) {
			first = i;
			break;
		}
	}
	if (first < 0) return undefined;
	const head = readMpegFrame(b, first)!;

	// Xing/Info (LAME) or VBRI header in the first frame carries the exact frame count.
	const sideInfo = head.version === 1 ? (head.mono ? 17 : 32) : head.mono ? 9 : 17;
	const xing = first + 4 + sideInfo;
	if (xing + 12 <= end && (ascii(b, xing, "Xing") || ascii(b, xing, "Info")) && b[xing + 7] & 1) {
		const frames = u32be(b, xing + 8);
		if (frames > 0) return (frames * head.samples) / head.sampleRate;
	}
	const vbri = first + 4 + 32;
	if (vbri + 18 <= end && ascii(b, vbri, "VBRI")) {
		const frames = u32be(b, vbri + 14);
		if (frames > 0) return (frames * head.samples) / head.sampleRate;
	}

	// No header: walk the frames. If the walk breaks off early, estimate the rest at the first frame's bitrate.
	let seconds = 0;
	let i = first;
	while (i < end) {
		const f = readMpegFrame(b, i);
		if (!f || i + f.length > end) break;
		seconds += f.samples / f.sampleRate;
		i += f.length;
	}
	const rest = end - i;
	if (rest > 0.05 * (end - first)) seconds += (rest * 8) / (head.bitrateKbps * 1000);
	return seconds > 0 ? seconds : undefined;
}

function oggDuration(b: Uint8Array): number | undefined {
	// Codec from the first page's packet: OpusHead (granule at 48 kHz, minus pre-skip) or Vorbis identification.
	const segments = b[26];
	const packet = 27 + segments;
	let rate: number;
	let preSkip = 0;
	if (ascii(b, packet, "OpusHead")) {
		rate = 48000;
		preSkip = u16le(b, packet + 10);
	} else if (b[packet] === 1 && ascii(b, packet + 1, "vorbis")) {
		rate = u32le(b, packet + 12);
	} else if (b[packet] === 0x7f && ascii(b, packet + 1, "FLAC") && ascii(b, packet + 9, "fLaC")) {
		// STREAMINFO follows its 4-byte block header; the sample rate is 20 bits at offset 10.
		const info = packet + 17;
		rate = (b[info + 10] << 12) | (b[info + 11] << 4) | (b[info + 12] >> 4);
	} else if (ascii(b, packet, "Speex   ")) {
		rate = u32le(b, packet + 36);
	} else {
		return undefined;
	}
	// The last page's granule position is the total sample count.
	for (let i = b.length - 27; i >= 0; i--) {
		if (b[i] === 0x4f && ascii(b, i, "OggS")) {
			const lo = u32le(b, i + 6);
			const hi = u32le(b, i + 10);
			if (hi === 0xffffffff && lo === 0xffffffff) continue; // page with no completed packet
			const granule = hi * 2 ** 32 + lo;
			return rate > 0 && granule > preSkip ? (granule - preSkip) / rate : undefined;
		}
	}
	return undefined;
}

function wavDuration(b: Uint8Array): number | undefined {
	let byteRate = 0;
	for (let i = 12; i + 8 <= b.length; ) {
		const size = u32le(b, i + 4);
		if (ascii(b, i, "fmt ")) byteRate = u32le(b, i + 16);
		if (ascii(b, i, "data")) {
			const available = b.length - (i + 8);
			const bytes = size === 0xffffffff || size > available ? available : size;
			return byteRate > 0 ? bytes / byteRate : undefined;
		}
		i += 8 + size + (size & 1);
	}
	return undefined;
}

/** Duration in seconds, or undefined if the format is not recognised or has no duration information. */
export function audioDurationSeconds(bytes: Uint8Array): number | undefined {
	if (bytes.length < 4) return undefined;
	let seconds: number | undefined;
	if (bytes.length >= 28 && ascii(bytes, 0, "OggS")) seconds = oggDuration(bytes);
	else if (bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WAVE")) seconds = wavDuration(bytes);
	else seconds = mp3Duration(bytes);
	return seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
