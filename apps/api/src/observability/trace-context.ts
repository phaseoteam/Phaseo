import type { RequestMeta } from "@core/types";

function normalizeTraceState(value: string | null): string | null {
	if (!value || value.length > 512) return null;
	const members = value.split(",");
	if (members.length > 32) return null;
	const key = /^[a-z0-9][a-z0-9_\-*\/]{0,255}(?:@[a-z0-9][a-z0-9_\-*\/]{0,13})?$/;
	const val = /^[\x20-\x2B\x2D-\x3C\x3E-\x7E]{0,256}$/;
	const normalized: string[] = [];
	for (const member of members) {
		const separator = member.indexOf("=");
		if (separator <= 0) return null;
		const memberKey = member.slice(0, separator).trim();
		const memberValue = member.slice(separator + 1).trim();
		if (!key.test(memberKey) || !val.test(memberValue)) return null;
		normalized.push(`${memberKey}=${memberValue}`);
	}
	return normalized.join(",");
}

export function parseW3cTraceContext(
	traceparent: string | null,
	tracestate: string | null = null,
): RequestMeta["otelTraceContext"] {
	if (!traceparent || traceparent.length > 512) return null;
	const parts = traceparent.trim().toLowerCase().split("-");
	if (parts.length < 4) return null;
	const [version, traceId, parentSpanId, flags] = parts;
	if (!/^[0-9a-f]{2}$/.test(version) || version === "ff") return null;
	if (version === "00" && parts.length !== 4) return null;
	if (!/^[0-9a-f]{32}$/.test(traceId) || /^0+$/.test(traceId)) return null;
	if (!/^[0-9a-f]{16}$/.test(parentSpanId) || /^0+$/.test(parentSpanId)) return null;
	if (!/^[0-9a-f]{2}$/.test(flags)) return null;
	return {
		traceId,
		parentSpanId,
		traceFlags: Number.parseInt(flags, 16) & 1,
		traceState: normalizeTraceState(tracestate),
	};
}

const MAX_METADATA_KEYS = 64;
const MAX_METADATA_KEY_LENGTH = 64;
const MAX_METADATA_VALUE_LENGTH = 512;

/**
 * The request body's `metadata` object as string pairs for Broadcast. Strings,
 * numbers and booleans are kept; nested values are dropped. Forwarding to
 * providers is unchanged: this only reads the object.
 */
export function requestMetadata(value: unknown): Record<string, string> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const out: Record<string, string> = {};
	let count = 0;
	for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
		if (count >= MAX_METADATA_KEYS) break;
		const key = rawKey.trim();
		if (!key || key.length > MAX_METADATA_KEY_LENGTH) continue;
		if (typeof rawValue !== "string" && typeof rawValue !== "number" && typeof rawValue !== "boolean") continue;
		out[key] = String(rawValue).slice(0, MAX_METADATA_VALUE_LENGTH);
		count += 1;
	}
	return count ? out : null;
}

// Two FNV-1a passes with different offsets, so any string maps to the same
// 128-bit trace ID every time.
function hashedTraceId(value: string): string {
	const prime = 0x100000001b3n;
	const mask = (1n << 64n) - 1n;
	let high = 0xcbf29ce484222325n;
	let low = 0x84222325cbf29ce4n;
	for (const byte of new TextEncoder().encode(value)) {
		high = ((high ^ BigInt(byte)) * prime) & mask;
		low = ((low ^ BigInt(byte ^ 0x5c)) * prime) & mask;
	}
	return high.toString(16).padStart(16, "0") + low.toString(16).padStart(16, "0");
}

/**
 * Trace context from `metadata.trace_id` and `metadata.parent_span_id`, used
 * when the request has no `traceparent` header. A 32-hex ID or UUID is used as
 * is; any other string is hashed so requests that share it share a trace.
 */
export function metadataTraceContext(metadata: Record<string, string> | null): RequestMeta["otelTraceContext"] {
	const raw = metadata?.trace_id?.trim();
	if (!raw) return null;
	const compact = raw.toLowerCase().replace(/^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/, "$1$2$3$4$5");
	const traceId = /^[0-9a-f]{32}$/.test(compact) && !/^0+$/.test(compact) ? compact : hashedTraceId(raw);
	const parent = metadata?.parent_span_id?.trim().toLowerCase() ?? "";
	return {
		traceId,
		parentSpanId: /^[0-9a-f]{16}$/.test(parent) && !/^0+$/.test(parent) ? parent : "",
		traceFlags: 1,
		traceState: null,
	};
}
