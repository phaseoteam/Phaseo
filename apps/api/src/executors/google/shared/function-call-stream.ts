import { normalizeGoogleModelSlug } from "./model";

export function supportsGeminiArgumentStreaming(model: string): boolean {
	const name = normalizeGoogleModelSlug(model).toLowerCase();
	const major = /^gemini-(\d+)/.exec(name)?.[1];
	return Number(major) >= 3 && !name.startsWith("gemini-3.1-flash-lite") && !/image|audio|live|robotics/.test(name);
}

type Path = Array<string | number>;
type Frame = { path: Path; array: boolean; keys: Set<string | number>; count: number };

function parsePath(value: unknown): Path {
	if (typeof value !== "string" || !value.startsWith("$") || value.length > 8192) {
		throw new Error("google_invalid_function_argument_path");
	}
	const path: Path = [];
	const pattern = /\.([^.[\]]+)|\[(\d+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\]/gy;
	let offset = 1;
	while (offset < value.length) {
		pattern.lastIndex = offset;
		const match = pattern.exec(value);
		if (!match || path.length >= 64) throw new Error("google_invalid_function_argument_path");
		const key = match[1] ?? match[2];
		path.push(match[1] !== undefined ? key : /^\d+$/.test(key) ? Number(key)
			: key.startsWith('"') ? JSON.parse(key) : JSON.parse('"' + key.slice(1, -1)
				.replace(/\\(.)|"/g, (_match, escaped: string | undefined) => escaped === "'" ? "'" : escaped ? `\\${escaped}` : '\\"') + '"'));
		offset = pattern.lastIndex;
	}
	if (!path.length) throw new Error("google_invalid_function_argument_path");
	return path;
}

function samePath(a: Path, b: Path): boolean {
	return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** Serialize Google's typed JSON-path fragments without assigning untrusted object keys. */
export class GeminiArgumentStream {
	private frames: Frame[] = [];
	private stringPath?: Path;
	private started = false;
	done = false;

	append(parts: unknown[], complete: boolean): string {
		if (this.done) throw new Error("google_function_arguments_already_complete");
		let delta = "";
		for (const raw of parts) {
			if (!raw || typeof raw !== "object") throw new Error("google_invalid_function_argument");
			const part = raw as Record<string, unknown>;
			const path = parsePath(part.jsonPath);
			if (this.stringPath) {
				if (!samePath(path, this.stringPath) || (part.stringValue !== undefined && typeof part.stringValue !== "string")
					|| ["numberValue", "boolValue", "nullValue"].some((key) => Object.hasOwn(part, key))) {
					throw new Error("google_invalid_function_string_continuation");
				}
				delta += JSON.stringify(part.stringValue ?? "").slice(1, -1);
				if (part.willContinue !== true) {
					delta += '"';
					this.stringPath = undefined;
				}
				continue;
			}
			if (!this.started) {
				this.started = true;
				delta += "{";
				this.frames.push({ path: [], array: false, keys: new Set(), count: 0 });
			}
			while (this.frames.length > 1 && !this.frames.at(-1)!.path.every((key, index) => path[index] === key)) {
				delta += this.frames.pop()!.array ? "]" : "}";
			}
			if (path.length <= this.frames.at(-1)!.path.length) throw new Error("google_invalid_function_argument_order");
			for (let depth = this.frames.at(-1)!.path.length; depth < path.length; depth++) {
				const frame = this.frames.at(-1)!;
				const key = path[depth];
				if (frame.keys.has(key) || (frame.array ? key !== frame.count : typeof key !== "string")) {
					throw new Error("google_invalid_function_argument_order");
				}
				frame.keys.add(key);
				if (frame.count++ > 0) delta += ",";
				if (!frame.array) delta += `${JSON.stringify(key)}:`;
				if (depth < path.length - 1) {
					const array = typeof path[depth + 1] === "number";
					delta += array ? "[" : "{";
					this.frames.push({ path: path.slice(0, depth + 1), array, keys: new Set(), count: 0 });
				}
			}
			let value: unknown;
			if (typeof part.stringValue === "string") value = part.stringValue;
			else if (typeof part.numberValue === "number" && Number.isFinite(part.numberValue)) value = part.numberValue;
			else if (typeof part.boolValue === "boolean") value = part.boolValue;
			else if (Object.hasOwn(part, "nullValue")) value = null;
			else throw new Error("google_invalid_function_argument_value");
			const json = JSON.stringify(value);
			if (part.willContinue === true) {
				if (typeof value !== "string") throw new Error("google_invalid_function_string_continuation");
				delta += json.slice(0, -1);
				this.stringPath = path;
			} else delta += json;
		}
		if (complete) {
			if (this.stringPath) throw new Error("google_incomplete_function_arguments");
			if (!this.started) delta += "{}";
			while (this.frames.length) delta += this.frames.pop()!.array ? "]" : "}";
			this.done = true;
		}
		return delta;
	}
}
