// Secrets and signed tokens for the Slack agent. This is the one definition:
// web-api (install, settings, link confirmation) and the Slack Worker (events,
// link buttons) each use a generated copy (scripts/sync-slack-secrets.mjs), so
// both sides read and write one format. Keep it stable, dependency-free, and
// covered by the fixed vectors in test-vectors.ts, which both apps test:
//
// - Encrypted secrets: "<version>.<iv>.<ciphertext>" (base64url, no padding),
//   AES-256-GCM over the JSON of a string record with sorted keys. The key is
//   SHA-256(SLACK_SECRETS_ENCRYPTION_KEY) and the version is
//   SLACK_SECRETS_ENCRYPTION_KEY_VERSION (default "v1").
// - Signed tokens: "<payload>.<signature>" (base64url, no padding), where the
//   payload is the JSON of the caller's fields plus purpose, exp (Unix seconds)
//   and a random nonce, and the signature is HMAC-SHA256(SLACK_STATE_SECRET)
//   over the payload's base64url text.

/** The settings these helpers read. Each app's Env has them. */
export type SlackSecretsEnv = {
	SLACK_SECRETS_ENCRYPTION_KEY?: string;
	SLACK_SECRETS_ENCRYPTION_KEY_VERSION?: string;
	SLACK_STATE_SECRET?: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const VERSION_PATTERN = /^[A-Za-z0-9_-]{1,16}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const IV_BYTES = 12;
const NONCE_BYTES = 16;
/** Large enough for any state or link token we mint; anything bigger is rejected unparsed. */
const MAX_TOKEN_LENGTH = 4_096;

export function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array {
	if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) throw new Error("invalid_base64url");
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function encryptionMaterial(env: SlackSecretsEnv): { secret: string; version: string } {
	const secret = env.SLACK_SECRETS_ENCRYPTION_KEY?.trim();
	if (!secret) throw new Error("slack_secrets_encryption_unconfigured");
	const version = env.SLACK_SECRETS_ENCRYPTION_KEY_VERSION?.trim() || "v1";
	if (!VERSION_PATTERN.test(version)) throw new Error("slack_secrets_encryption_version_invalid");
	return { secret, version };
}

async function aesKey(secret: string): Promise<CryptoKey> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
	return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function sortedRecord(record: Record<string, string>): Record<string, string> {
	const sorted: Record<string, string> = {};
	for (const key of Object.keys(record).sort()) {
		const value = record[key];
		if (typeof value !== "string") throw new Error("slack_secrets_value_invalid");
		sorted[key] = value;
	}
	return sorted;
}

/** Encrypts a record of strings into the one text column format the Slack tables use. */
export async function encryptSlackSecrets(env: SlackSecretsEnv, record: Record<string, string>): Promise<string> {
	const { secret, version } = encryptionMaterial(env);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		await aesKey(secret),
		encoder.encode(JSON.stringify(sortedRecord(record))),
	);
	return `${version}.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

/** Decrypts a value from encryptSlackSecrets. Throws on a wrong key, version or tampered value. */
export async function decryptSlackSecrets(env: SlackSecretsEnv, value: string): Promise<Record<string, string>> {
	const { secret, version } = encryptionMaterial(env);
	const parts = String(value ?? "").split(".");
	if (parts.length !== 3) throw new Error("slack_secrets_malformed");
	const [valueVersion, ivText, ciphertextText] = parts;
	if (valueVersion !== version) throw new Error("slack_secrets_key_version_unknown");
	let plaintext: ArrayBuffer;
	try {
		const iv = base64UrlDecode(ivText);
		if (iv.byteLength !== IV_BYTES) throw new Error("iv");
		plaintext = await crypto.subtle.decrypt(
			{ name: "AES-GCM", iv: arrayBuffer(iv) },
			await aesKey(secret),
			arrayBuffer(base64UrlDecode(ciphertextText)),
		);
	} catch {
		throw new Error("slack_secrets_undecryptable");
	}
	const parsed: unknown = JSON.parse(decoder.decode(plaintext));
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("slack_secrets_malformed");
	for (const entry of Object.values(parsed)) if (typeof entry !== "string") throw new Error("slack_secrets_malformed");
	return parsed as Record<string, string>;
}

export type SlackTokenPurpose = "install" | "link";

export type SlackTokenResult<T> =
	| { ok: true; payload: T & { purpose: SlackTokenPurpose; exp: number; nonce: string } }
	| { ok: false; reason: "unconfigured" | "malformed" | "bad_signature" | "wrong_purpose" | "expired" };

async function hmacKey(env: SlackSecretsEnv): Promise<CryptoKey | null> {
	const secret = env.SLACK_STATE_SECRET?.trim();
	if (!secret) return null;
	return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** Signs a short-lived token for one purpose. The payload cannot override purpose, exp or nonce. */
export async function signSlackToken(
	env: SlackSecretsEnv,
	purpose: SlackTokenPurpose,
	payload: Record<string, unknown>,
	ttlSeconds: number,
	now = Date.now(),
): Promise<string> {
	const key = await hmacKey(env);
	if (!key) throw new Error("slack_state_secret_unconfigured");
	if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error("slack_token_ttl_invalid");
	const body = {
		...payload,
		purpose,
		exp: Math.floor(now / 1000) + ttlSeconds,
		nonce: base64UrlEncode(crypto.getRandomValues(new Uint8Array(NONCE_BYTES))),
	};
	const encoded = base64UrlEncode(encoder.encode(JSON.stringify(body)));
	const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(encoded)));
	return `${encoded}.${base64UrlEncode(signature)}`;
}

/**
 * Verifies a token from signSlackToken. The signature is checked first, with
 * crypto.subtle.verify (a constant-time comparison), so nothing in an unsigned
 * payload is trusted; then the purpose and expiry.
 */
export async function verifySlackToken<T extends Record<string, unknown> = Record<string, unknown>>(
	env: SlackSecretsEnv,
	purpose: SlackTokenPurpose,
	token: unknown,
	now = Date.now(),
): Promise<SlackTokenResult<T>> {
	const key = await hmacKey(env);
	if (!key) return { ok: false, reason: "unconfigured" };
	if (typeof token !== "string" || !token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "malformed" };
	const parts = token.split(".");
	if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
	const [encoded, signatureText] = parts;
	let signature: Uint8Array;
	try {
		signature = base64UrlDecode(signatureText);
	} catch {
		return { ok: false, reason: "malformed" };
	}
	if (signature.byteLength !== 32) return { ok: false, reason: "bad_signature" };
	const valid = await crypto.subtle.verify("HMAC", key, arrayBuffer(signature), encoder.encode(encoded));
	if (!valid) return { ok: false, reason: "bad_signature" };
	let parsed: unknown;
	try {
		parsed = JSON.parse(decoder.decode(base64UrlDecode(encoded)));
	} catch {
		return { ok: false, reason: "malformed" };
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, reason: "malformed" };
	const body = parsed as Record<string, unknown>;
	if (body.purpose !== purpose) return { ok: false, reason: "wrong_purpose" };
	if (typeof body.exp !== "number" || !Number.isFinite(body.exp) || body.exp * 1000 <= now) return { ok: false, reason: "expired" };
	if (typeof body.nonce !== "string" || !body.nonce) return { ok: false, reason: "malformed" };
	return { ok: true, payload: body as T & { purpose: SlackTokenPurpose; exp: number; nonce: string } };
}
