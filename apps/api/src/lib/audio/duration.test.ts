import { parseBuffer } from "music-metadata";
import { describe, expect, it } from "vitest";

import { audioDurationSeconds } from "./duration";

// ---- fixture builders (synthetic but structurally valid files) ----

const concat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
};
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const le = (value: number, bytes: number) => {
	const out = new Uint8Array(bytes);
	for (let i = 0; i < bytes; i++) out[i] = Math.floor(value / 2 ** (8 * i)) & 0xff;
	return out;
};
const be32 = (v: number) => new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);

/** MPEG-1 Layer III, 128 kbps, 44.1 kHz, joint stereo. Frame length 417 bytes, 418 when padded. */
function mp3Frame(padded = false, fill = 0x55): Uint8Array {
	const frame = new Uint8Array(padded ? 418 : 417).fill(fill);
	frame.set([0xff, 0xfb, 0x90 | (padded ? 0x02 : 0), 0x44]);
	return frame;
}
/** MPEG-2 Layer III, 64 kbps, 22.05 kHz, mono. Frame length 208 bytes, 576 samples. */
function mp3Mpeg2MonoFrame(): Uint8Array {
	const frame = new Uint8Array(208).fill(0x55);
	frame.set([0xff, 0xf3, 0x80, 0xc4]);
	return frame;
}
const mp3Cbr = (frames: number) => concat(...Array.from({ length: frames }, (_, i) => mp3Frame(i % 3 === 0)));

function id3v2(payload = 100): Uint8Array {
	const header = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, (payload >> 7) & 0x7f, payload & 0x7f]);
	return concat(header, new Uint8Array(payload));
}
const id3v1 = () => concat(ascii("TAG"), new Uint8Array(125));

/** LAME-style "Info" frame declaring frame and byte counts (as LAME writes it), followed by the audio frames. */
function mp3WithInfoHeader(frames: number): Uint8Array {
	const audio = mp3Cbr(frames);
	const info = new Uint8Array(417);
	info.set([0xff, 0xfb, 0x90, 0x44]);
	info.set(ascii("Info"), 4 + 32);
	info.set(be32(3), 4 + 32 + 4); // flags: frame count + byte count present
	info.set(be32(frames), 4 + 32 + 8);
	info.set(be32(info.length + audio.length), 4 + 32 + 12);
	return concat(info, audio);
}

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let r = i << 24;
		for (let k = 0; k < 8; k++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
		t[i] = r >>> 0;
	}
	return t;
})();
function oggPage(packet: Uint8Array, granule: number, seq: number, headerType: number): Uint8Array {
	const segments: number[] = [];
	let left = packet.length;
	while (left >= 255) {
		segments.push(255);
		left -= 255;
	}
	segments.push(left);
	const page = concat(ascii("OggS"), new Uint8Array([0, headerType]), le(granule, 8), le(0x1234, 4), le(seq, 4), le(0, 4), new Uint8Array([segments.length, ...segments]), packet);
	let crc = 0;
	for (const byte of page) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
	page.set(le(crc, 4), 22);
	return page;
}
function oggOpus(seconds: number, preSkip = 312): Uint8Array {
	const head = concat(ascii("OpusHead"), new Uint8Array([1, 2]), le(preSkip, 2), le(48000, 4), le(0, 2), new Uint8Array([0]));
	const tags = concat(ascii("OpusTags"), le(0, 4), le(0, 4));
	const pages = [oggPage(head, 0, 0, 2), oggPage(tags, 0, 1, 0)];
	const total = Math.round(seconds * 48000) + preSkip;
	const steps = 4;
	for (let i = 1; i <= steps; i++) pages.push(oggPage(new Uint8Array(200).fill(0xf8), Math.round((total * i) / steps), i + 1, i === steps ? 4 : 0));
	return concat(...pages);
}
function oggVorbis(seconds: number, rate = 44100): Uint8Array {
	const ident = concat(new Uint8Array([1]), ascii("vorbis"), le(0, 4), new Uint8Array([2]), le(rate, 4), le(0, 4), le(128000, 4), le(0, 4), new Uint8Array([0xb8, 1]));
	return concat(oggPage(ident, 0, 0, 2), oggPage(new Uint8Array(300).fill(0x11), Math.round(seconds * rate), 1, 4));
}
function wav(seconds: number, rate = 44100, channels = 2, bits = 16): Uint8Array {
	const byteRate = (rate * channels * bits) / 8;
	const data = new Uint8Array(Math.round(seconds * byteRate));
	const fmt = concat(ascii("fmt "), le(16, 4), le(1, 2), le(channels, 2), le(rate, 4), le(byteRate, 4), le((channels * bits) / 8, 2), le(bits, 2));
	const list = concat(ascii("LIST"), le(4, 4), ascii("INFO"));
	const body = concat(ascii("WAVE"), fmt, list, ascii("data"), le(data.length, 4), data);
	return concat(ascii("RIFF"), le(body.length, 4), body);
}

async function reference(bytes: Uint8Array, mimeType: string): Promise<number | undefined> {
	const parsed = await parseBuffer(bytes, { mimeType, size: bytes.length }, { duration: true, skipCovers: true });
	return parsed.format.duration;
}

// ---- tests ----

const MP3_FRAME_SECONDS = 1152 / 44100;

describe("audioDurationSeconds", () => {
	const cases: Array<[string, () => Uint8Array, string, number]> = [
		["CBR MP3 (frame walk)", () => mp3Cbr(230), "audio/mpeg", 230 * MP3_FRAME_SECONDS],
		["MP3 with ID3v2 and ID3v1 tags", () => concat(id3v2(), mp3Cbr(100), id3v1()), "audio/mpeg", 100 * MP3_FRAME_SECONDS],
		["MP3 with a LAME Info header", () => mp3WithInfoHeader(345), "audio/mpeg", 345 * MP3_FRAME_SECONDS],
		["MPEG-2 mono MP3", () => concat(...Array.from({ length: 150 }, mp3Mpeg2MonoFrame)), "audio/mpeg", (150 * 576) / 22050],
		["Ogg Opus", () => oggOpus(3.25), "audio/ogg", 3.25],
		["Ogg Vorbis", () => oggVorbis(2.5), "audio/ogg", 2.5],
		["WAV with an extra chunk before data", () => wav(1.5), "audio/wav", 1.5],
	];

	for (const [name, build, mime, expected] of cases) {
		it(`${name}: matches the expected duration and music-metadata`, async () => {
			const bytes = build();
			const ours = audioDurationSeconds(bytes);
			expect(ours).toBeDefined();
			expect(ours!).toBeCloseTo(expected, 3);
			const theirs = await reference(bytes, mime);
			expect(theirs).toBeDefined();
			expect(ours!).toBeCloseTo(theirs!, 3);
		});
	}

	it("uses the Xing frame count rather than walking frames", () => {
		// Header claims 1000 frames but only 10 follow: the header wins, as it does in music-metadata.
		const bytes = mp3WithInfoHeader(1000).subarray(0, 417 * 11);
		expect(audioDurationSeconds(bytes)).toBeCloseTo(1000 * MP3_FRAME_SECONDS, 6);
	});

	it("estimates the tail at the first frame's bitrate when the frame walk breaks off", () => {
		const bytes = concat(mp3Cbr(50), new Uint8Array(417 * 50).fill(0x13));
		expect(audioDurationSeconds(bytes)!).toBeCloseTo(50 * MP3_FRAME_SECONDS + (417 * 50 * 8) / 128000, 6);
	});

	it("handles a WAV whose data size is unknown (streamed)", () => {
		const bytes = wav(1);
		const view = new DataView(bytes.buffer);
		const dataAt = bytes.findIndex((_, i) => String.fromCharCode(...bytes.subarray(i, i + 4)) === "data");
		view.setUint32(dataAt + 4, 0xffffffff, true);
		expect(audioDurationSeconds(bytes)).toBeCloseTo(1, 6);
	});

	it("returns undefined for bytes it does not understand", () => {
		expect(audioDurationSeconds(new Uint8Array(0))).toBeUndefined();
		expect(audioDurationSeconds(new Uint8Array(4096).fill(0x42))).toBeUndefined();
		expect(audioDurationSeconds(concat(ascii("fLaC"), new Uint8Array(100)))).toBeUndefined();
		expect(audioDurationSeconds(concat(ascii("OggS"), new Uint8Array(100)))).toBeUndefined();
	});
});
