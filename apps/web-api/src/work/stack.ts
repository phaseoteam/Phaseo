// Stack traces for the work tracker's error ingest: parse the stack strings browsers and Node
// produce into frames, and normalise frames that callers send themselves. Frames are innermost
// first, as the engines print them. Everything here treats its input as untrusted text.

export type StackFrame = {
	function?: string;
	file?: string;
	line?: number;
	column?: number;
	inApp?: boolean;
};

export const MAX_FRAMES = 50;
const MAX_STACK_LINES = 200;
const MAX_FUNCTION_LENGTH = 200;
const MAX_FILE_LENGTH = 500;

// V8 (Chrome, Edge, Node): "    at fn (file:1:2)", "    at file:1:2", "    at async fn (file:1:2)".
const V8_FRAME = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;
// V8 frames without a position: "    at fn (native)", "    at fn (<anonymous>)".
const V8_FRAME_NO_POSITION = /^\s*at (?:(.+?) \()?(native|<anonymous>|unknown location)\)?\s*$/;
// V8 eval frames: "    at eval (eval at fn (file:1:2), <anonymous>:3:4)". Keep the outer location.
const V8_EVAL = /\(eval at [^(]*\((.+?):(\d+):(\d+)\)/;
// SpiderMonkey (Firefox) and JavaScriptCore (Safari): "fn@file:1:2", "@file:1:2", "global code@file:1:2".
const AT_FRAME = /^\s*(.*?)@(.+?):(\d+)(?::(\d+))?\s*$/;
// Safari frames without a location: "fn@[native code]", "[native code]".
const AT_NATIVE = /^\s*(?:(.*?)@)?\[native code\]\s*$/;

/** Parses a raw stack string (Chrome/V8, Firefox or Safari format) into frames, innermost first. */
export function parseStack(stack: string | null | undefined): StackFrame[] {
	if (typeof stack !== "string" || !stack) return [];
	const frames: StackFrame[] = [];
	const lines = stack.split(/\r?\n/, MAX_STACK_LINES);
	for (const line of lines) {
		if (frames.length >= MAX_FRAMES) break;
		const frame = parseStackLine(line);
		if (frame) frames.push(normaliseFrame(frame));
	}
	return frames;
}

function parseStackLine(line: string): StackFrame | null {
	if (!line.trim()) return null;
	if (/^\s*at /.test(line)) {
		const evalMatch = V8_EVAL.exec(line);
		if (evalMatch) {
			const name = /^\s*at (.+?) \(eval at /.exec(line)?.[1];
			return { function: name, file: evalMatch[1], line: Number(evalMatch[2]), column: Number(evalMatch[3]) };
		}
		const match = V8_FRAME.exec(line);
		if (match) {
			return { function: match[1], file: match[2], line: Number(match[3]), column: Number(match[4]) };
		}
		const native = V8_FRAME_NO_POSITION.exec(line);
		if (native) return { function: native[1], file: native[2], inApp: false };
		return null;
	}
	const native = AT_NATIVE.exec(line);
	if (native) return { function: native[1] || undefined, file: "[native code]", inApp: false };
	const match = AT_FRAME.exec(line);
	if (match) {
		return {
			function: match[1] || undefined,
			file: match[2],
			line: Number(match[3]),
			column: match[4] === undefined ? undefined : Number(match[4]),
		};
	}
	return null;
}

/** The file without its query string or hash, so cache-busting parameters don't split groups. */
export function stripUrlNoise(file: string): string {
	return file.replace(/[?#].*$/, "");
}

const VENDOR_FILE_PATTERNS: RegExp[] = [
	/(^|[\\/])node_modules[\\/]/,
	/^(chrome|moz|safari|safari-web|ms-browser)-extension:/i,
	/^webpack\/runtime\b/,
	/^webpack:\/\/\/?(webpack|\(webpack\))\//,
	/^\[native code\]$/,
	/^(native|<anonymous>|unknown location)$/,
	/^node:/,
	/^internal\//,
	// Public CDNs and common third-party scripts.
	/^https?:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|ajax\.googleapis\.com|code\.jquery\.com|esm\.sh|cdn\.skypack\.dev)\//i,
	/^https?:\/\/(www\.)?(googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|js\.stripe\.com|static\.cloudflareinsights\.com|challenges\.cloudflare\.com)\//i,
	// This tracker's own capture script.
	/\/api\/_web\/work\/errors\.js$/,
];

/** Whether the file is library, extension, runtime or CDN code rather than the app's own. */
export function isVendorFile(file: string | undefined): boolean {
	if (!file) return false;
	return VENDOR_FILE_PATTERNS.some((pattern) => pattern.test(file));
}

function cleanFunctionName(name: unknown): string | undefined {
	if (typeof name !== "string") return undefined;
	let value = name.trim();
	value = value.replace(/^(async|new) /, "");
	// Firefox marks anonymous closures with "/<" and generators with "*".
	value = value.replace(/(\/<)+$/, "").replace(/^\*/, "").replace(/<\/?$/, "");
	if (!value || value === "<anonymous>" || value === "?") return undefined;
	return value.slice(0, MAX_FUNCTION_LENGTH);
}

function positiveInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100_000_000 ? value : undefined;
}

/** Cleans one frame: trims names, strips query strings and hashes, and decides inApp. */
export function normaliseFrame(frame: StackFrame): StackFrame {
	const fn = cleanFunctionName(frame.function);
	const file = typeof frame.file === "string" && frame.file.trim()
		? stripUrlNoise(frame.file.trim()).slice(0, MAX_FILE_LENGTH)
		: undefined;
	const line = positiveInteger(frame.line);
	const column = positiveInteger(frame.column);
	// A caller may mark a frame as not in-app; vendor files are never in-app whatever it says.
	const inApp = frame.inApp === false ? false : !isVendorFile(file);
	const result: StackFrame = { inApp };
	if (fn) result.function = fn;
	if (file) result.file = file;
	if (line !== undefined) result.line = line;
	if (column !== undefined) result.column = column;
	return result;
}

/** Normalises frames from an untrusted payload, dropping anything that isn't a frame object. */
export function normaliseFrames(value: unknown): StackFrame[] {
	if (!Array.isArray(value)) return [];
	const frames: StackFrame[] = [];
	for (const raw of value.slice(0, MAX_FRAMES)) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
		const input = raw as Record<string, unknown>;
		const frame = normaliseFrame({
			function: typeof input.function === "string" ? input.function : undefined,
			file: typeof input.file === "string" ? input.file : undefined,
			line: typeof input.line === "number" ? input.line : undefined,
			column: typeof input.column === "number" ? input.column : undefined,
			inApp: typeof input.inApp === "boolean" ? input.inApp : undefined,
		});
		if (frame.function || frame.file) frames.push(frame);
	}
	return frames;
}
