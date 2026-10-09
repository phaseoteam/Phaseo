import { describe, expect, it } from "vitest";
import { SseParser, parseSseText, type SseFrame } from "./sse-parser";

type Plain = { event: string | null; data: string; dataLines: number; raw: string };

const plain = (frames: SseFrame[]): Plain[] =>
	frames.map((frame) => ({
		event: frame.event,
		data: frame.data,
		dataLines: frame.dataLines,
		raw: frame.raw,
	}));

function parseInPieces(text: string, cuts: number[], withFlush = false): Plain[] {
	const parser = new SseParser();
	const frames: SseFrame[] = [];
	let prev = 0;
	for (const cut of [...cuts, text.length]) {
		frames.push(...parser.push(text.slice(prev, cut)));
		prev = cut;
	}
	if (withFlush) frames.push(...parser.flush());
	return plain(frames);
}

function parseBytesInPieces(bytes: Uint8Array, cuts: number[], withFlush = false): Plain[] {
	const parser = new SseParser();
	const frames: SseFrame[] = [];
	let prev = 0;
	for (const cut of [...cuts, bytes.length]) {
		frames.push(...parser.pushBytes(bytes.slice(prev, cut)));
		prev = cut;
	}
	if (withFlush) frames.push(...parser.flush());
	return plain(frames);
}

const SAMPLE_LF = [
	": keep-alive",
	"",
	"event: response.created",
	"data: {\"response\":{\"id\":\"resp_1\"}}",
	"",
	"data: {\"choices\":[{\"delta\":{\"content\":\"héllo 👋\"}}]}",
	"",
	"event: message_delta",
	"data: {\"a\":1,",
	"data: \"b\":2}",
	"",
	"data: [DONE]",
	"",
	"",
].join("\n");

describe("SseParser", () => {
	it("parses LF-framed events, comments, multi-line data, and [DONE]", () => {
		const frames = plain(parseSseText(SAMPLE_LF));
		expect(frames).toEqual([
			{
				event: "response.created",
				data: "{\"response\":{\"id\":\"resp_1\"}}",
				dataLines: 1,
				raw: "event: response.created\ndata: {\"response\":{\"id\":\"resp_1\"}}",
			},
			{
				event: null,
				data: "{\"choices\":[{\"delta\":{\"content\":\"héllo 👋\"}}]}",
				dataLines: 1,
				raw: "data: {\"choices\":[{\"delta\":{\"content\":\"héllo 👋\"}}]}",
			},
			{
				event: "message_delta",
				data: "{\"a\":1,\n\"b\":2}",
				dataLines: 2,
				raw: "event: message_delta\ndata: {\"a\":1,\ndata: \"b\":2}",
			},
			{ event: null, data: "[DONE]", dataLines: 1, raw: "data: [DONE]" },
		]);
		expect(JSON.parse(frames[2].data)).toEqual({ a: 1, b: 2 });
	});

	it("treats CRLF and lone CR line endings exactly like LF", () => {
		const expected = plain(parseSseText(SAMPLE_LF));
		expect(plain(parseSseText(SAMPLE_LF.replace(/\n/g, "\r\n")))).toEqual(expected);
		expect(plain(parseSseText(SAMPLE_LF.replace(/\n/g, "\r")))).toEqual(expected);
	});

	it("is independent of chunk boundaries, including boundaries inside CRLF", () => {
		for (const variant of [SAMPLE_LF, SAMPLE_LF.replace(/\n/g, "\r\n"), SAMPLE_LF.replace(/\n/g, "\r")]) {
			const expected = plain(parseSseText(variant));
			for (let cut = 0; cut <= variant.length; cut += 1) {
				expect(parseInPieces(variant, [cut], true)).toEqual(expected);
			}
			for (let a = 0; a <= variant.length; a += 7) {
				for (let b = a; b <= variant.length; b += 5) {
					expect(parseInPieces(variant, [a, b], true)).toEqual(expected);
				}
			}
			// Single-character chunks.
			const all = Array.from({ length: variant.length }, (_, index) => index);
			expect(parseInPieces(variant, all, true)).toEqual(expected);
		}
	});

	it("is independent of byte boundaries, including inside multi-byte UTF-8 sequences", () => {
		const bytes = new TextEncoder().encode(SAMPLE_LF.replace(/\n/g, "\r\n"));
		const expected = plain(parseSseText(SAMPLE_LF));
		for (let cut = 0; cut <= bytes.length; cut += 1) {
			expect(parseBytesInPieces(bytes, [cut], true)).toEqual(expected);
		}
		const all = Array.from({ length: bytes.length }, (_, index) => index);
		expect(parseBytesInPieces(bytes, all, true)).toEqual(expected);
	});

	it("returns several frames from one chunk and keeps the partial remainder", () => {
		const parser = new SseParser();
		const first = parser.push("data: 1\n\ndata: 2\n\ndata: 3");
		expect(first.map((frame) => frame.data)).toEqual(["1", "2"]);
		const second = parser.push("\n\n");
		expect(second.map((frame) => frame.data)).toEqual(["3"]);
		expect(parser.flush()).toEqual([]);
	});

	it("only dispatches a trailing frame without its blank line on flush", () => {
		const parser = new SseParser();
		expect(parser.push("event: done\ndata: {\"x\":1}")).toEqual([]);
		const flushed = plain(parser.flush());
		expect(flushed).toEqual([{ event: "done", data: "{\"x\":1}", dataLines: 1, raw: "event: done\ndata: {\"x\":1}" }]);
		// A terminated-but-undispatched frame (single newline) also flushes.
		const second = new SseParser();
		expect(second.push("data: tail\n")).toEqual([]);
		expect(second.flush().map((frame) => frame.data)).toEqual(["tail"]);
	});

	it("ignores comment-only blocks and blank-line runs", () => {
		const frames = parseSseText(": ping\n\n\n\n:another\r\n\r\ndata: x\n\n");
		expect(plain(frames)).toEqual([{ event: null, data: "x", dataLines: 1, raw: "data: x" }]);
	});

	it("keeps comment lines in raw while excluding them from data", () => {
		const [frame] = parseSseText(": note\ndata: x\n\n");
		expect(frame.data).toBe("x");
		expect(frame.raw).toBe(": note\ndata: x");
	});

	it("passes malformed data through untouched for callers to reject", () => {
		const frames = parseSseText("data: {not json\n\ndata: ok\n\n");
		expect(frames.map((frame) => frame.data)).toEqual(["{not json", "ok"]);
		expect(() => JSON.parse(frames[0].data)).toThrow();
	});

	it("follows SSE field rules: one leading space stripped, no-colon fields, unknown fields", () => {
		const frames = plain(parseSseText("data:nospace\n\ndata:  two\n\ndata\n\nid: 7\nretry: 10\n\nevent:  spaced  \ndata: v\n\n"));
		expect(frames.map((frame) => [frame.event, frame.data, frame.dataLines])).toEqual([
			[null, "nospace", 1],
			[null, " two", 1],
			[null, "", 1],
			[null, "", 0],
			["spaced", "v", 1],
		]);
	});

	it("handles very large frames delivered in many small chunks", () => {
		const big = "A".repeat(4 * 1024 * 1024);
		const text = `event: response.output_text.delta\ndata: {"delta":"${big}"}\r\n\r\ndata: [DONE]\n\n`;
		const parser = new SseParser();
		const frames: SseFrame[] = [];
		const started = Date.now();
		for (let offset = 0; offset < text.length; offset += 1024) {
			frames.push(...parser.push(text.slice(offset, offset + 1024)));
		}
		const elapsedMs = Date.now() - started;
		expect(frames).toHaveLength(2);
		expect(JSON.parse(frames[0].data).delta).toHaveLength(big.length);
		expect(frames[0].event).toBe("response.output_text.delta");
		expect(frames[1].data).toBe("[DONE]");
		// Linear scanning keeps this well under a second; the old split-per-chunk
		// approach rescanned ~8 GB of text here.
		expect(elapsedMs).toBeLessThan(5_000);
	});
});
