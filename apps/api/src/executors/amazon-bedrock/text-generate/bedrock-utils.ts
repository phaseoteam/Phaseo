import type { ExecutorExecuteArgs } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";

type BedrockCredentials = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region?: string;
	baseUrl?: string;
};

type MantleAuth =
	| {
		mode: "sigv4";
		region: string;
		baseUrl: string;
		credentials: BedrockCredentials & { region: string; baseUrl: string };
	}
	| {
		mode: "bearer";
		token: string;
		region: string;
		baseUrl: string;
	};

type SignRequestArgs = {
	method: string;
	url: string;
	body: string;
	region: string;
	service: string;
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	headers?: Record<string, string>;
};

export async function signAwsV4Request(args: SignRequestArgs): Promise<Record<string, string>> {
	const parsed = new URL(args.url);
	const now = new Date();
	const amzDate = toAmzDate(now);
	const dateStamp = amzDate.slice(0, 8);
	const payloadHash = await sha256Hex(args.body);
	const canonicalHeadersMap = new Map<string, string>();
	canonicalHeadersMap.set("host", parsed.host);
	canonicalHeadersMap.set("x-amz-content-sha256", payloadHash);
	canonicalHeadersMap.set("x-amz-date", amzDate);
	for (const [key, value] of Object.entries(args.headers ?? {})) {
		canonicalHeadersMap.set(key.toLowerCase(), value.trim().replace(/\s+/g, " "));
	}
	if (args.sessionToken) canonicalHeadersMap.set("x-amz-security-token", args.sessionToken);
	const sortedHeaderKeys = [...canonicalHeadersMap.keys()].sort();
	const canonicalHeaders = sortedHeaderKeys.map((key) => `${key}:${canonicalHeadersMap.get(key) ?? ""}\n`).join("");
	const signedHeaders = sortedHeaderKeys.join(";");
	const canonicalRequest = [
		args.method.toUpperCase(),
		normalizePath(parsed.pathname),
		normalizeQuery(parsed.searchParams),
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	].join("\n");
	const credentialScope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;
	const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hex(canonicalRequest)].join("\n");
	const signingKey = await getAwsSigningKey(args.secretAccessKey, dateStamp, args.region, args.service);
	const signature = toHex(await hmacSha256(signingKey, stringToSign));
	const authorization = [
		`AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${credentialScope}`,
		`SignedHeaders=${signedHeaders}`,
		`Signature=${signature}`,
	].join(", ");
	const signed: Record<string, string> = {
		...(args.headers ?? {}),
		Host: parsed.host,
		"X-Amz-Date": amzDate,
		"X-Amz-Content-Sha256": payloadHash,
		Authorization: authorization,
	};
	if (args.sessionToken) signed["X-Amz-Security-Token"] = args.sessionToken;
	return signed;
}

// The derived SigV4 signing key only depends on (secret, day, region, service),
// so deriving it (four HMAC rounds) per request is wasted work. Keep a small
// isolate-local cache keyed by a hash of the secret; the key rolls over daily.
const AWS_SIGNING_KEY_CACHE_MAX_ENTRIES = 64;
const awsSigningKeyCache = new Map<string, Uint8Array>();

export function clearAwsSigningKeyCache(): void {
	awsSigningKeyCache.clear();
}

export function awsSigningKeyCacheSize(): number {
	return awsSigningKeyCache.size;
}

export async function getAwsSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
	const cacheKey = `${await sha256Hex(secretAccessKey)}\n${dateStamp}\n${region}\n${service}`;
	const cached = awsSigningKeyCache.get(cacheKey);
	if (cached) return cached;
	const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);
	const signingKey = await hmacSha256(kService, "aws4_request");
	awsSigningKeyCache.set(cacheKey, signingKey);
	while (awsSigningKeyCache.size > AWS_SIGNING_KEY_CACHE_MAX_ENTRIES) {
		const oldest = awsSigningKeyCache.keys().next().value;
		if (oldest === undefined) break;
		awsSigningKeyCache.delete(oldest);
	}
	return signingKey;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return toHex(new Uint8Array(digest));
}

async function hmacSha256(key: string | Uint8Array, value: string): Promise<Uint8Array> {
	const keyBytes = typeof key === "string" ? new TextEncoder().encode(key) : key;
	const cryptoKey = await crypto.subtle.importKey("raw", keyBytes as unknown as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(value));
	return new Uint8Array(signature);
}

export function toAmzDate(date: Date): string {
	const yyyy = String(date.getUTCFullYear());
	const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(date.getUTCDate()).padStart(2, "0");
	const hh = String(date.getUTCHours()).padStart(2, "0");
	const mi = String(date.getUTCMinutes()).padStart(2, "0");
	const ss = String(date.getUTCSeconds()).padStart(2, "0");
	return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

/**
 * SigV4 canonical URI. Every AWS service except S3 encodes each path segment a
 * second time, so an already-encoded segment such as `v1%3A0` (the `:` in a
 * Bedrock Runtime model ID) is signed as `v1%253A0`.
 */
export function normalizePath(pathname: string): string {
	if (!pathname) return "/";
	return pathname.split("/").map((segment) => encodeRfc3986(segment)).join("/");
}

export function normalizeQuery(searchParams: URLSearchParams): string {
	const entries: Array<[string, string]> = [];
	for (const [key, value] of searchParams.entries()) {
		entries.push([encodeRfc3986(key), encodeRfc3986(value)]);
	}
	entries.sort(([aKey, aValue], [bKey, bValue]) => {
		if (aKey === bKey) return aValue.localeCompare(bValue);
		return aKey.localeCompare(bKey);
	});
	return entries.map(([key, value]) => `${key}=${value}`).join("&");
}

export function encodeRfc3986(value: string): string {
	return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
		`%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

export function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseBedrockCredentialMaterial(value: string | undefined): BedrockCredentials | null {
	if (!value || typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;

	if (trimmed.startsWith("{")) {
		try {
			const json = JSON.parse(trimmed) as Record<string, unknown>;
			const accessKeyId = getString(json, [
				"accessKeyId",
				"access_key_id",
				"aws_access_key_id",
				"AWS_ACCESS_KEY_ID",
			]);
			const secretAccessKey = getString(json, [
				"secretAccessKey",
				"secret_access_key",
				"aws_secret_access_key",
				"AWS_SECRET_ACCESS_KEY",
			]);
			if (!accessKeyId || !secretAccessKey) return null;
			return {
				accessKeyId,
				secretAccessKey,
				sessionToken: getString(json, [
					"sessionToken",
					"session_token",
					"aws_session_token",
					"AWS_SESSION_TOKEN",
				]),
				region: getString(json, ["region", "aws_region", "AWS_REGION"]),
				baseUrl: getString(json, ["baseUrl", "base_url", "endpoint", "bedrock_endpoint"]),
			};
		} catch {
			return null;
		}
	}

	const firstColon = trimmed.indexOf(":");
	if (firstColon <= 0) return null;
	const secondColon = trimmed.indexOf(":", firstColon + 1);
	const accessKeyId = trimmed.slice(0, firstColon);
	const secretAccessKey = secondColon > firstColon
		? trimmed.slice(firstColon + 1, secondColon)
		: trimmed.slice(firstColon + 1);
	const sessionToken = secondColon > firstColon ? trimmed.slice(secondColon + 1) : undefined;
	if (!accessKeyId || !secretAccessKey) return null;
	return {
		accessKeyId,
		secretAccessKey,
		sessionToken: sessionToken || undefined,
	};
}

export function getString(record: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

export function resolveMantleAuth(args: ExecutorExecuteArgs): {
	keyInfo: { source: "gateway" | "byok"; byokId: string | null };
	auth: MantleAuth;
} {
	const bindings = getBindings() as any;
	const keyInfo = resolveProviderKey(args, () => {
		const bearerKey = [bindings.AMAZON_BEDROCK_API_KEY, bindings.AMAZON_BEDROCK_MANTLE_API_KEY, bindings.AWS_BEARER_TOKEN_BEDROCK]
			.find((value) => typeof value === "string" && value.trim());
		if (typeof bearerKey === "string") {
			return bearerKey;
		}
		const accessKeyId = typeof bindings.AWS_ACCESS_KEY_ID === "string" ? bindings.AWS_ACCESS_KEY_ID : "";
		const secretAccessKey = typeof bindings.AWS_SECRET_ACCESS_KEY === "string" ? bindings.AWS_SECRET_ACCESS_KEY : "";
		const sessionToken = typeof bindings.AWS_SESSION_TOKEN === "string" ? bindings.AWS_SESSION_TOKEN : "";
		if (!accessKeyId || !secretAccessKey) return undefined;
		return `${accessKeyId}:${secretAccessKey}${sessionToken ? `:${sessionToken}` : ""}`;
	});

	const rawKey = keyInfo.key.trim();
	if (!rawKey) throw new Error(`${args.providerId}_key_missing`);

	const parsed = parseBedrockCredentialMaterial(rawKey);
	const baseUrlRaw =
		parsed?.baseUrl ||
		bindings.AMAZON_BEDROCK_MANTLE_BASE_URL;
	const region = (
		parsed?.region ||
		extractRegionFromMantleUrl(baseUrlRaw) ||
		bindings.AMAZON_BEDROCK_REGION ||
		bindings.AWS_REGION ||
		"us-west-2"
	).trim();
	const defaultBaseUrl = `https://bedrock-mantle.${region}.api.aws`;
	const baseUrl = String(baseUrlRaw || defaultBaseUrl).replace(/\/+$/, "");
	assertBedrockMantleBaseUrl(baseUrl);

	return {
		keyInfo,
		auth: parsed
			? {
				mode: "sigv4",
				region,
				baseUrl,
				credentials: {
					...parsed,
					region,
					baseUrl,
				},
			}
			: {
				mode: "bearer",
				token: rawKey,
				region,
				baseUrl,
			},
	};
}

export function assertBedrockMantleBaseUrl(value: string): void {
	let hostname: string;
	try {
		hostname = new URL(value).hostname.toLowerCase();
	} catch {
		throw new Error("amazon_bedrock_mantle_base_url_invalid");
	}

	const isTestEndpoint = hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".example");
	const isMantleEndpoint = /^bedrock-mantle\.[a-z0-9-]+\.(?:api\.aws|amazonaws\.com)$/.test(hostname);
	if (!isTestEndpoint && !isMantleEndpoint) {
		throw new Error("amazon_bedrock_mantle_endpoint_required");
	}
}

export function extractRegionFromMantleUrl(value: string | undefined): string | null {
	if (!value) return null;
	const match = value.match(/bedrock-mantle[\.-]([a-z0-9-]+)\.(?:api\.aws|amazonaws\.com)/i);
	return match?.[1] ?? null;
}

/**
 * Cross-Region inference profile IDs (`global.anthropic.claude-sonnet-4-6`,
 * `us.openai.gpt-5.6-sol`) are served only by bedrock-runtime; bedrock-mantle
 * serves bare In-Region model IDs. The catalogue's model ID therefore picks the host.
 */
export function isBedrockInferenceProfileId(model: string | null | undefined): boolean {
	return /^(?:global|us|us-gov|eu|apac|au|jp)\./i.test(String(model ?? "").trim());
}

export function bedrockRuntimeBaseUrl(region: string): string {
	if (!/^[a-z0-9-]+$/.test(region)) throw new Error("amazon_bedrock_region_invalid");
	return `https://bedrock-runtime.${region}.amazonaws.com`;
}

/** SigV4 service name: `bedrock` for bedrock-runtime, `bedrock-mantle` for Mantle. */
export function bedrockSigningService(url: string): "bedrock" | "bedrock-mantle" {
	return new URL(url).hostname.toLowerCase().startsWith("bedrock-runtime.") ? "bedrock" : "bedrock-mantle";
}

const BEDROCK_STREAM_ERROR_TYPES: Record<string, string> = {
	throttlingException: "rate_limit_error",
	serviceUnavailableException: "overloaded_error",
	validationException: "invalid_request_error",
};

/**
 * InvokeModelWithResponseStream answers in the AWS event stream format
 * (application/vnd.amazon.eventstream), not SSE. Each `chunk` event carries one
 * Anthropic Messages stream event as base64 JSON. This re-emits those events as
 * SSE so the Claude stream transformers can read them, and turns exception
 * frames into Anthropic `error` events.
 */
export function createBedrockInvokeStreamToSseTransformer(): TransformStream<Uint8Array, Uint8Array> {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	let buffer = new Uint8Array(0);
	return new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			const joined = new Uint8Array(buffer.length + chunk.length);
			joined.set(buffer, 0);
			joined.set(chunk, buffer.length);
			buffer = joined;
			// Prelude: total length, headers length, prelude CRC. Trailer: message CRC.
			while (buffer.length >= 12) {
				const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
				const totalLength = view.getUint32(0);
				const headersLength = view.getUint32(4);
				if (totalLength < 16 || headersLength > totalLength - 16) {
					throw new Error("amazon_bedrock_event_stream_malformed");
				}
				if (buffer.length < totalLength) break;
				const headers = parseEventStreamHeaders(buffer.subarray(12, 12 + headersLength), decoder);
				const payload = decoder.decode(buffer.subarray(12 + headersLength, totalLength - 4));
				buffer = buffer.slice(totalLength);
				const sse = eventStreamMessageToSse(headers, payload);
				if (sse) controller.enqueue(encoder.encode(sse));
			}
		},
	});
}

function eventStreamMessageToSse(headers: Record<string, string>, payload: string): string | null {
	if (headers[":message-type"] === "event") {
		if (headers[":event-type"] !== "chunk") return null;
		const bytes = (JSON.parse(payload) as { bytes?: unknown })?.bytes;
		if (typeof bytes !== "string") return null;
		const event = JSON.parse(decodeBase64Utf8(bytes));
		if (!event || typeof event.type !== "string") return null;
		return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
	}
	const errorType = headers[":exception-type"] ?? headers[":error-code"] ?? "internalServerException";
	let message = headers[":error-message"] ?? errorType;
	try {
		const parsed = JSON.parse(payload) as { message?: unknown };
		if (typeof parsed?.message === "string" && parsed.message) message = parsed.message;
	} catch {
		// Keep the header message.
	}
	const error = { type: BEDROCK_STREAM_ERROR_TYPES[errorType] ?? "api_error", message };
	return `event: error\ndata: ${JSON.stringify({ type: "error", error })}\n\n`;
}

function parseEventStreamHeaders(bytes: Uint8Array, decoder: TextDecoder): Record<string, string> {
	const headers: Record<string, string> = {};
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 0;
	while (offset < bytes.length) {
		const nameLength = bytes[offset];
		offset += 1;
		const name = decoder.decode(bytes.subarray(offset, offset + nameLength));
		offset += nameLength;
		const valueType = bytes[offset];
		offset += 1;
		switch (valueType) {
			case 0: // true
			case 1: // false
				break;
			case 2: offset += 1; break;
			case 3: offset += 2; break;
			case 4: offset += 4; break;
			case 5: // long
			case 8: // timestamp
				offset += 8;
				break;
			case 6: // byte array
			case 7: { // string
				const length = view.getUint16(offset);
				offset += 2;
				if (valueType === 7) headers[name] = decoder.decode(bytes.subarray(offset, offset + length));
				offset += length;
				break;
			}
			case 9: offset += 16; break; // uuid
			default:
				throw new Error("amazon_bedrock_event_stream_header_invalid");
		}
	}
	return headers;
}

function decodeBase64Utf8(value: string): string {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}
