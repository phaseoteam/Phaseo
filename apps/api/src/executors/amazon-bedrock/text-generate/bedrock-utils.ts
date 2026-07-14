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

type BedrockAuth =
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

async function getAwsSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Promise<Uint8Array> {
	const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
	const kRegion = await hmacSha256(kDate, region);
	const kService = await hmacSha256(kRegion, service);
	return hmacSha256(kService, "aws4_request");
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

export function normalizePath(pathname: string): string {
	if (!pathname) return "/";
	return pathname.split("/").map((segment) => encodeRfc3986(decodeSegment(segment))).join("/");
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

export function decodeSegment(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
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

export function resolveBedrockAuth(args: ExecutorExecuteArgs): {
	keyInfo: { source: "gateway" | "byok"; byokId: string | null };
	auth: BedrockAuth;
} {
	const bindings = getBindings() as any;
	const keyInfo = resolveProviderKey(args, () => {
		if (typeof bindings.AMAZON_BEDROCK_API_KEY === "string" && bindings.AMAZON_BEDROCK_API_KEY.trim()) {
			return bindings.AMAZON_BEDROCK_API_KEY;
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
		bindings.AMAZON_BEDROCK_BASE_URL;
	const region = (
		parsed?.region ||
		bindings.AMAZON_BEDROCK_REGION ||
		bindings.AWS_REGION ||
		extractRegionFromBedrockUrl(baseUrlRaw) ||
		"us-east-1"
	).trim();
	const defaultBaseUrl = `https://bedrock-mantle.${region}.api.aws`;
	const baseUrl = String(baseUrlRaw || defaultBaseUrl).replace(/\/+$/, "");

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

export function extractRegionFromBedrockUrl(value: string | undefined): string | null {
	if (!value) return null;
	const match =
		value.match(/bedrock-runtime[\.-]([a-z0-9-]+)\.amazonaws\.com/i) ||
		value.match(/bedrock-mantle[\.-]([a-z0-9-]+)\.api\.aws/i);
	return match?.[1] ?? null;
}
