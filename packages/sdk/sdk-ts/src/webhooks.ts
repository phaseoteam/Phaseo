import { createHmac, timingSafeEqual } from "node:crypto";

export type AsyncWebhookHeaders =
  | Headers
  | Iterable<[string, string]>
  | Record<string, string | readonly string[] | null | undefined>;

export type VerifyAsyncWebhookSignatureOptions = {
  secret: string;
  body: string | Uint8Array;
  headers: AsyncWebhookHeaders;
  toleranceSeconds?: number | null;
  now?: Date | number;
};

const DEFAULT_TOLERANCE_SECONDS = 300;
const SIGNATURE_HEADER = "x-phaseo-signature";
const TIMESTAMP_HEADER = "x-phaseo-timestamp";

function getHeaderValue(headers: AsyncWebhookHeaders, name: string): string | null {
  const lowerName = name.toLowerCase();
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return headers.get(name);
  }
  if (typeof (headers as { [Symbol.iterator]?: unknown })?.[Symbol.iterator] === "function" && !Array.isArray(headers)) {
    for (const [key, value] of headers as Iterable<[string, string]>) {
      if (String(key).toLowerCase() === lowerName) return String(value);
    }
    return null;
  }
  const record = headers as Record<string, string | readonly string[] | null | undefined>;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== lowerName) continue;
    if (Array.isArray(value)) return value[0] == null ? null : String(value[0]);
    return value == null ? null : String(value);
  }
  return null;
}

function bodyToString(body: string | Uint8Array): string {
  return typeof body === "string" ? body : new TextDecoder().decode(body);
}

function parseTimestampMs(timestamp: string): number {
  const trimmed = timestamp.trim();
  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) return Number.NaN;
    return trimmed.length >= 13 ? numeric : numeric * 1000;
  }
  return Date.parse(trimmed);
}

function isFreshTimestamp(timestamp: string, toleranceSeconds: number | null | undefined, now: Date | number | undefined): boolean {
  if (toleranceSeconds == null) return true;
  if (!Number.isFinite(toleranceSeconds) || toleranceSeconds < 0) return false;
  const timestampMs = parseTimestampMs(timestamp);
  if (!Number.isFinite(timestampMs)) return false;
  const nowMs = now instanceof Date
    ? now.getTime()
    : typeof now === "number"
      ? now > 10_000_000_000
        ? now
        : now * 1000
      : Date.now();
  if (!Number.isFinite(nowMs)) return false;
  return Math.abs(nowMs - timestampMs) <= toleranceSeconds * 1000;
}

function safeCompareHex(actualHex: string, expectedHex: string): boolean {
  if (!/^[a-f0-9]+$/i.test(actualHex) || actualHex.length % 2 !== 0) return false;
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function computeAsyncWebhookSignature(secret: string, timestamp: string, body: string | Uint8Array): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${bodyToString(body)}`)
    .digest("hex");
}

export function verifyAsyncWebhookSignature(options: VerifyAsyncWebhookSignatureOptions): boolean {
  const secret = options.secret.trim();
  if (!secret) return false;
  const timestamp = getHeaderValue(options.headers, TIMESTAMP_HEADER);
  const signature = getHeaderValue(options.headers, SIGNATURE_HEADER);
  if (!timestamp || !signature) return false;
  const toleranceSeconds = options.toleranceSeconds === undefined ? DEFAULT_TOLERANCE_SECONDS : options.toleranceSeconds;
  if (!isFreshTimestamp(timestamp, toleranceSeconds, options.now)) return false;
  const expected = computeAsyncWebhookSignature(secret, timestamp, options.body);
  return safeCompareHex(signature.trim(), expected);
}
