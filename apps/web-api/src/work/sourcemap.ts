// Source maps for error groups: maps uploaded per release (stored in R2, WORK_SOURCEMAPS) turn a
// minified frame (file, line, column) back into the original file, line, column and name. Only
// standard (v3, non-indexed) maps are read. Decoding stops at the frame's line, decoded lines are
// kept per isolate for a few maps, and this runs only when a person opens an error group, never
// on ingest, so it costs nothing per event.

import type { StackFrame } from "./stack";

export const MAX_SOURCEMAP_BYTES = 10 * 1024 * 1024;
const MAX_CACHED_MAPS = 4;
const MAX_FRAMES_TO_MAP = 20;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_VALUE = new Map([...BASE64].map((char, index) => [char, index]));

export type RawSourceMap = { version: number; sources: string[]; names?: string[]; mappings: string; sourceRoot?: string; sections?: unknown };

type Segment = [generatedColumn: number, source: number, line: number, column: number, name?: number];

/** A parsed map with its mappings decoded lazily, line by line, as far as anyone has asked. */
export class SourceMapReader {
	private readonly lines: Segment[][] = [];
	private offset = 0;
	private state = { source: 0, line: 0, column: 0, name: 0 };

	constructor(private readonly map: RawSourceMap) {}

	static parse(text: string): SourceMapReader | null {
		try {
			const map = JSON.parse(text) as RawSourceMap;
			if (map?.version !== 3 || map.sections || typeof map.mappings !== "string" || !Array.isArray(map.sources)) return null;
			return new SourceMapReader(map);
		} catch {
			return null;
		}
	}

	/** Decodes generated lines up to and including `line` (0-based). */
	private decodeTo(line: number) {
		const text = this.map.mappings;
		while (this.lines.length <= line && this.offset <= text.length) {
			const end = text.indexOf(";", this.offset);
			const stop = end === -1 ? text.length : end;
			const segments: Segment[] = [];
			let column = 0;
			for (const part of text.slice(this.offset, stop).split(",")) {
				if (!part) continue;
				const values = decodeVlq(part);
				if (!values.length) continue;
				column += values[0]!;
				if (values.length >= 4) {
					this.state.source += values[1]!;
					this.state.line += values[2]!;
					this.state.column += values[3]!;
					if (values.length >= 5) this.state.name += values[4]!;
					segments.push(values.length >= 5
						? [column, this.state.source, this.state.line, this.state.column, this.state.name]
						: [column, this.state.source, this.state.line, this.state.column]);
				}
			}
			this.lines.push(segments);
			this.offset = stop + 1;
			if (end === -1) break;
		}
	}

	/** The original position for a 1-based line and 1-based column, or null when unmapped. */
	originalPosition(line: number, column: number): { source: string; line: number; column: number; name?: string } | null {
		if (!Number.isInteger(line) || line < 1 || !Number.isInteger(column) || column < 1) return null;
		this.decodeTo(line - 1);
		const segments = this.lines[line - 1];
		if (!segments?.length) return null;
		const target = column - 1;
		let found: Segment | undefined;
		let low = 0;
		let high = segments.length - 1;
		while (low <= high) {
			const middle = (low + high) >> 1;
			if (segments[middle]![0] <= target) { found = segments[middle]; low = middle + 1; } else high = middle - 1;
		}
		if (!found) return null;
		const sourceName = this.map.sources[found[1]];
		if (typeof sourceName !== "string") return null;
		const root = this.map.sourceRoot ? this.map.sourceRoot.replace(/\/?$/, "/") : "";
		const name = found[4] !== undefined ? this.map.names?.[found[4]] : undefined;
		return { source: `${root}${sourceName}`, line: found[2] + 1, column: found[3] + 1, ...(typeof name === "string" ? { name } : {}) };
	}
}

export function decodeVlq(text: string): number[] {
	const values: number[] = [];
	let value = 0;
	let shift = 0;
	for (const char of text) {
		const digit = BASE64_VALUE.get(char);
		if (digit === undefined) return [];
		value += (digit & 31) << shift;
		if (digit & 32) {
			shift += 5;
			if (shift > 30) return [];
		} else {
			values.push(value & 1 ? -(value >>> 1) : value >>> 1);
			value = 0;
			shift = 0;
		}
	}
	return shift === 0 ? values : [];
}

/** The name source maps are matched by: the file's last path part, without query or hash. */
export function sourcemapFileName(file: string | undefined): string | null {
	if (!file) return null;
	const path = file.replace(/[?#].*$/, "");
	const name = path.slice(path.lastIndexOf("/") + 1).trim();
	return name && name.length <= 300 ? name : null;
}

export type MappedFrame = StackFrame & { original?: { file: string; line: number; column: number; function?: string } };

/** Loads a stored map: reads the object, parses it, and keeps the reader for later calls. */
export type MapLoader = (objectKey: string) => Promise<SourceMapReader | null>;

const cache = new Map<string, SourceMapReader>();

export function r2MapLoader(bucket: Pick<R2Bucket, "get"> | undefined): MapLoader {
	return async (objectKey) => {
		const cached = cache.get(objectKey);
		if (cached) return cached;
		if (!bucket) return null;
		const object = await bucket.get(objectKey);
		if (!object || object.size > MAX_SOURCEMAP_BYTES) return null;
		const reader = SourceMapReader.parse(await object.text());
		if (!reader) return null;
		cache.set(objectKey, reader);
		while (cache.size > MAX_CACHED_MAPS) cache.delete(cache.keys().next().value!);
		return reader;
	};
}

/**
 * Frames with their original positions where a map for the file is known. `maps` is file name →
 * object key for the group's release. Frames without a map, or that the map doesn't cover, are
 * returned as they were.
 */
export async function mapFrames(frames: StackFrame[], maps: Map<string, string>, load: MapLoader): Promise<MappedFrame[]> {
	const out: MappedFrame[] = [];
	for (const [index, frame] of frames.entries()) {
		const name = sourcemapFileName(frame.file);
		const key = name ? maps.get(name) : undefined;
		if (!key || index >= MAX_FRAMES_TO_MAP || !frame.line || !frame.column) {
			out.push(frame);
			continue;
		}
		const reader = await load(key).catch(() => null);
		const position = reader?.originalPosition(frame.line, frame.column);
		out.push(position ? { ...frame, original: { file: position.source, line: position.line, column: position.column, ...(position.name ? { function: position.name } : {}) } } : frame);
	}
	return out;
}
