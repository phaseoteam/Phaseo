// Purpose: Privacy-safe observability helpers.
// Why: Keep request/transform logging useful without exposing user prompt content.
// How: Redacts sensitive input fields and bounds payload sizes for Axiom events.

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 32;
const MAX_OBJECT_KEYS = 80;
const MAX_STRING_LENGTH = 800;

const CONTENT_KEYS = new Set([
	"content",
	"text",
	"prompt",
	"instructions",
	"input_text",
	"output_text",
	"reasoning_content",
	"delta",
	"summary",
	"summary_text",
	"transcript",
	"audio",
	"image",
	"video",
	"b64_json",
	"url",
	"data",
	"bytes",
]);

const SECRET_KEY_PATTERNS = [
	/api[_-]?key/i,
	/authorization/i,
	/bearer/i,
	/secret/i,
	/password/i,
	/token(?!s?$)/i,
];

function truncateString(value: string): string {
	if (value.length <= MAX_STRING_LENGTH) return value;
	return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function redactedMarker(value: unknown): string {
	if (typeof value === "string") return `[redacted ${value.length} chars]`;
	if (Array.isArray(value)) return `[redacted array:${value.length}]`;
	if (value && typeof value === "object") return "[redacted object]";
	return "[redacted]";
}

function isSecretKey(key: string): boolean {
	return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function shouldRedactByKey(key: string, value: unknown): boolean {
	const normalized = key.toLowerCase();

	// Keep usage/cost stats queryable.
	if (
		normalized.includes("token") ||
		normalized.includes("usage") ||
		normalized.includes("count") ||
		normalized.includes("latency") ||
		normalized.includes("throughput")
	) {
		return false;
	}

	if (isSecretKey(normalized)) return true;
	if (CONTENT_KEYS.has(normalized)) return true;

	// "input" can be either raw user text or a nested array/object.
	if (normalized === "input" && typeof value === "string") return true;

	return false;
}

function sanitizeInternal(value: unknown, depth: number): unknown {
	if (depth > MAX_DEPTH) return "[truncated depth]";

	if (value == null) return value;
	if (typeof value === "string") return truncateString(value);
	if (typeof value !== "object") return value;

	if (Array.isArray(value)) {
		const limited = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeInternal(item, depth + 1));
		if (value.length > MAX_ARRAY_ITEMS) {
			limited.push(`[truncated ${value.length - MAX_ARRAY_ITEMS} items]`);
		}
		return limited;
	}

	const input = value as Record<string, unknown>;
	const entries = Object.entries(input).slice(0, MAX_OBJECT_KEYS);
	const output: Record<string, unknown> = {};

	for (const [key, val] of entries) {
		if (shouldRedactByKey(key, val)) {
			output[key] = redactedMarker(val);
			continue;
		}
		output[key] = sanitizeInternal(val, depth + 1);
	}

	if (Object.keys(input).length > MAX_OBJECT_KEYS) {
		output._truncated_keys = Object.keys(input).length - MAX_OBJECT_KEYS;
	}

	return output;
}

export function sanitizeForAxiom(value: unknown): unknown {
	return sanitizeInternal(value, 0);
}

export function sanitizeJsonStringForAxiom(raw: string | null | undefined): unknown {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	try {
		return sanitizeForAxiom(JSON.parse(trimmed));
	} catch {
		return sanitizeForAxiom(trimmed);
	}
}

export function stringifyForAxiom(value: unknown, maxChars = 24000): string | null {
	try {
		const raw = JSON.stringify(value);
		if (raw.length <= maxChars) return raw;
		return `${raw.slice(0, maxChars)}...[truncated ${raw.length - maxChars} chars]`;
	} catch {
		return null;
	}
}
