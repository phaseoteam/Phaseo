// Purpose: Venice end-to-end encryption (E2EE) for `e2ee-*` models served through the `venice-e2ee` provider.
// Why: Venice relays only ciphertext to an attested TEE when the client encrypts the prompt. Without this the
//      route could not run at all (the adapter refused it), and a plaintext call would silently lose the guarantee.
// How: Wraps the executor's upstream fetch. For the provider call only it
//      1. fetches the model's TEE attestation with a fresh 32-byte nonce and requires `verified: true`, a matching
//         nonce and a signing key (cached per model for a few minutes),
//      2. encrypts every `system`/`user` message for the enclave (secp256k1 ECDH -> HKDF-SHA256 -> AES-256-GCM),
//      3. sends Venice's `X-Venice-TEE-*` headers with a per-request ephemeral client key, and
//      4. returns a response whose encrypted content chunks are decrypted before the shared OpenAI parser reads them.
// Protocol: https://docs.venice.ai/guides/features/tee-e2ee-models.md (fetched 2026-11-17).

import { secp256k1 } from "@noble/curves/secp256k1";
import type { ExecutorExecuteArgs, ExecutorUpstreamTiming } from "@executors/types";

const HKDF_INFO = new TextEncoder().encode("ecdsa_encryption");
/** ephemeral public key (65) + AES-GCM nonce (12) + tag (16) bytes, hex encoded. */
const MIN_ENCRYPTED_HEX_LENGTH = 186;
const ATTESTATION_TTL_MS = 5 * 60 * 1000;
const ATTESTATION_TIMEOUT_MS = 10_000;
const ENCRYPTED_ROLES = new Set(["system", "user", "developer"]);

export class VeniceE2EEError extends Error {
	constructor(code: string, detail?: string) {
		super(detail ? `${code}: ${detail}` : code);
		this.name = "VeniceE2EEError";
	}
}

type CachedModelKey = { modelPublicKeyHex: string; expiresAt: number };
const attestedKeys = new Map<string, CachedModelKey>();

/** Test hook: forget cached attestations. */
export function resetVeniceE2EEAttestationCache(): void {
	attestedKeys.clear();
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
	return out;
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) throw new VeniceE2EEError("venice_e2ee_invalid_hex");
	const out = new Uint8Array(clean.length / 2);
	for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
	return out;
}

function looksEncrypted(value: unknown): value is string {
	return typeof value === "string" && value.length >= MIN_ENCRYPTED_HEX_LENGTH && value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}

/** Accepts the uncompressed (65-byte, with or without the 04 prefix) or compressed form. */
export function normalizePublicKey(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const withPrefix = clean.length === 128 ? `04${clean}` : clean;
	try {
		return secp256k1.ProjectivePoint.fromHex(withPrefix).toRawBytes(false);
	} catch {
		throw new VeniceE2EEError("venice_e2ee_invalid_model_key");
	}
}

async function aesKeyFromSharedPoint(privateKey: Uint8Array, publicKey: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
	// The x coordinate of the ECDH point is the shared secret (the compressed point minus its prefix byte).
	const shared = secp256k1.getSharedSecret(privateKey, publicKey, true).slice(1);
	const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		// An empty salt is equivalent to RFC 5869's default salt of HashLen zero bytes.
		{ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: HKDF_INFO },
		hkdfKey,
		{ name: "AES-GCM", length: 256 },
		false,
		[usage],
	);
}

/** Encrypts one message for the enclave: hex(ephemeral_public(65) || nonce(12) || ciphertext+tag). */
export async function encryptForModel(plaintext: string, modelPublicKey: Uint8Array): Promise<string> {
	const ephemeralPrivate = secp256k1.utils.randomPrivateKey();
	const ephemeralPublic = secp256k1.getPublicKey(ephemeralPrivate, false);
	const key = await aesKeyFromSharedPoint(ephemeralPrivate, modelPublicKey, "encrypt");
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, new TextEncoder().encode(plaintext)));
	ephemeralPrivate.fill(0);
	const out = new Uint8Array(65 + 12 + ciphertext.length);
	out.set(ephemeralPublic, 0);
	out.set(nonce, 65);
	out.set(ciphertext, 77);
	return bytesToHex(out);
}

/** Decrypts one content chunk from the enclave. Returns null when the value is not ciphertext for this client. */
export async function decryptFromModel(
	ciphertextHex: string,
	clientPrivateKey: Uint8Array,
	keyCache?: Map<string, CryptoKey>,
): Promise<string | null> {
	if (!looksEncrypted(ciphertextHex)) return null;
	try {
		const raw = hexToBytes(ciphertextHex);
		const serverPublic = raw.slice(0, 65);
		const nonce = raw.slice(65, 77);
		const ciphertext = raw.slice(77);
		const cacheKey = bytesToHex(serverPublic);
		let key = keyCache?.get(cacheKey);
		if (!key) {
			key = await aesKeyFromSharedPoint(clientPrivateKey, serverPublic, "decrypt");
			keyCache?.set(cacheKey, key);
		}
		const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
		return new TextDecoder().decode(plaintext);
	} catch {
		// Hex-looking text that does not authenticate is ordinary content, not ours to change.
		return null;
	}
}

function messageText(message: any): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (content == null) return "";
	if (Array.isArray(content)) {
		const parts: string[] = [];
		for (const part of content) {
			if (typeof part === "string") parts.push(part);
			else if (part?.type === "text" && typeof part.text === "string") parts.push(part.text);
			else throw new VeniceE2EEError("venice_e2ee_unsupported_content", `E2EE carries text only, got ${String(part?.type ?? "unknown")}`);
		}
		return parts.join("\n");
	}
	throw new VeniceE2EEError("venice_e2ee_unsupported_content");
}

/** Encrypts every system, developer and user message. Venice rejects plaintext in those roles once E2EE headers are sent. */
export async function encryptChatMessages(body: Record<string, any>, modelPublicKey: Uint8Array): Promise<Record<string, any>> {
	const messages = Array.isArray(body.messages) ? body.messages : [];
	const encrypted = [] as any[];
	for (const message of messages) {
		if (!ENCRYPTED_ROLES.has(String(message?.role))) {
			encrypted.push(message);
			continue;
		}
		encrypted.push({
			...message,
			// Venice's enclave decrypts `system` and `user`; a developer turn is sent as system so it is never plaintext.
			role: message.role === "developer" ? "system" : message.role,
			content: await encryptForModel(messageText(message), modelPublicKey),
		});
	}
	return { ...body, messages: encrypted, stream: true };
}

function randomNonceHex(): string {
	return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function attestationUrl(chatUrl: string, model: string, nonce: string): string {
	const base = chatUrl.replace(/\/chat\/completions(?:\?.*)?$/, "");
	if (base === chatUrl) throw new VeniceE2EEError("venice_e2ee_unsupported_endpoint", "E2EE runs on chat completions only");
	return `${base}/tee/attestation?model=${encodeURIComponent(model)}&nonce=${nonce}`;
}

function attestationDeclaresDebug(attestation: any): boolean {
	return [attestation?.debug, attestation?.debug_mode, attestation?.tdx_debug, attestation?.is_debug].some((value) => value === true);
}

/** Fetches and checks the model's attestation, returning the enclave public key as Venice sent it. */
export async function fetchAttestedModelKey(input: {
	chatUrl: string;
	model: string;
	authorization: string;
	fetchImpl: (url: string, init: RequestInit) => Promise<Response>;
	now?: number;
}): Promise<string> {
	const now = input.now ?? Date.now();
	const cacheKey = `${input.chatUrl}|${input.model}`;
	const cached = attestedKeys.get(cacheKey);
	if (cached && cached.expiresAt > now) return cached.modelPublicKeyHex;

	const nonce = randomNonceHex();
	const response = await input.fetchImpl(attestationUrl(input.chatUrl, input.model, nonce), {
		method: "GET",
		headers: { Authorization: input.authorization, Accept: "application/json" },
		signal: AbortSignal.timeout(ATTESTATION_TIMEOUT_MS),
	});
	if (!response.ok) throw new VeniceE2EEError("venice_e2ee_attestation_failed", `HTTP ${response.status}`);
	const attestation: any = await response.json().catch(() => null);
	if (attestation?.verified !== true) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "not verified");
	if (String(attestation?.nonce ?? "").toLowerCase() !== nonce) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "nonce mismatch");
	if (attestationDeclaresDebug(attestation)) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "debug enclave");
	const modelPublicKeyHex = attestation?.signing_key ?? attestation?.signing_public_key;
	if (typeof modelPublicKeyHex !== "string" || !modelPublicKeyHex) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "no signing key");
	normalizePublicKey(modelPublicKeyHex);
	attestedKeys.set(cacheKey, { modelPublicKeyHex, expiresAt: now + ATTESTATION_TTL_MS });
	return modelPublicKeyHex;
}

async function decryptChoiceFields(payload: any, clientPrivateKey: Uint8Array, keyCache: Map<string, CryptoKey>): Promise<boolean> {
	let changed = false;
	const decryptField = async (holder: any, field: string) => {
		if (!holder || !looksEncrypted(holder[field])) return;
		const plain = await decryptFromModel(holder[field], clientPrivateKey, keyCache);
		if (plain !== null) {
			holder[field] = plain;
			changed = true;
		}
	};
	for (const choice of Array.isArray(payload?.choices) ? payload.choices : []) {
		for (const holder of [choice?.delta, choice?.message]) {
			if (!holder) continue;
			await decryptField(holder, "content");
			await decryptField(holder, "reasoning_content");
			await decryptField(holder, "reasoning");
			for (const call of Array.isArray(holder.tool_calls) ? holder.tool_calls : []) {
				await decryptField(call?.function, "arguments");
			}
		}
	}
	return changed;
}

/** Returns a Response with the same status and headers whose encrypted chunks are decrypted. */
export function decryptingResponse(response: Response, clientPrivateKey: Uint8Array): Response {
	const keyCache = new Map<string, CryptoKey>();
	const contentType = response.headers.get("content-type") ?? "";
	if (!response.body) return response;

	if (!contentType.includes("text/event-stream")) {
		const body = (async () => {
			const text = await response.text();
			try {
				const json = JSON.parse(text);
				await decryptChoiceFields(json, clientPrivateKey, keyCache);
				return JSON.stringify(json);
			} catch {
				return text;
			}
		})();
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				controller.enqueue(new TextEncoder().encode(await body));
				controller.close();
			},
		});
		return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers });
	}

	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffered = "";
	const rewriteLine = async (line: string): Promise<string> => {
		if (!line.startsWith("data:")) return line;
		const data = line.slice(5).trimStart();
		if (!data || data === "[DONE]") return line;
		try {
			const json = JSON.parse(data);
			return (await decryptChoiceFields(json, clientPrivateKey, keyCache)) ? `data: ${JSON.stringify(json)}` : line;
		} catch {
			return line;
		}
	};
	const transform = new TransformStream<Uint8Array, Uint8Array>({
		async transform(chunk, controller) {
			buffered += decoder.decode(chunk, { stream: true });
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			const out: string[] = [];
			for (const line of lines) out.push(await rewriteLine(line.replace(/\r$/, "")));
			if (out.length > 0) controller.enqueue(encoder.encode(`${out.join("\n")}\n`));
		},
		async flush(controller) {
			buffered += decoder.decode();
			if (buffered) controller.enqueue(encoder.encode(await rewriteLine(buffered.replace(/\r$/, ""))));
		},
	});
	return new Response(response.body.pipeThrough(transform), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

function readHeader(headers: HeadersInit | undefined, name: string): string | null {
	return new Headers(headers ?? {}).get(name);
}

/**
 * Returns executor args whose provider fetch runs Venice's E2EE protocol. Attestation calls are recorded as
 * preflight fetches; timing lookups on the decrypting response resolve to the original upstream response.
 */
export function withVeniceE2EE(args: ExecutorExecuteArgs): ExecutorExecuteArgs {
	const base = args.upstreamTiming;
	const baseFetch: ExecutorUpstreamTiming["fetch"] = base
		? base.fetch
		: (input, init) => globalThis.fetch(input, init);
	const originals = new WeakMap<Response, Response>();

	const fetch: ExecutorUpstreamTiming["fetch"] = async (input, init, phase = "provider") => {
		if (phase !== "provider") return baseFetch(input, init, phase);
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		if (typeof init?.body !== "string") throw new VeniceE2EEError("venice_e2ee_unsupported_request");
		const body = JSON.parse(init.body);
		const authorization = readHeader(init.headers, "authorization");
		if (!authorization) throw new VeniceE2EEError("venice_e2ee_missing_credentials");

		const modelPublicKeyHex = await fetchAttestedModelKey({
			chatUrl: url,
			model: String(body.model ?? ""),
			authorization,
			fetchImpl: (attestUrl, attestInit) => baseFetch(attestUrl, attestInit, "preflight"),
		});
		const clientPrivateKey = secp256k1.utils.randomPrivateKey();
		const clientPublicKeyHex = bytesToHex(secp256k1.getPublicKey(clientPrivateKey, false));
		const encryptedBody = await encryptChatMessages(body, normalizePublicKey(modelPublicKeyHex));

		const headers = new Headers(init.headers ?? {});
		headers.set("X-Venice-TEE-Client-Pub-Key", clientPublicKeyHex);
		headers.set("X-Venice-TEE-Model-Pub-Key", modelPublicKeyHex);
		headers.set("X-Venice-TEE-Signing-Algo", "ecdsa");

		const response = await baseFetch(input, { ...init, headers, body: JSON.stringify(encryptedBody) }, phase);
		if (!response.ok) return response;
		const decrypted = decryptingResponse(response, clientPrivateKey);
		originals.set(decrypted, response);
		return decrypted;
	};

	return {
		...args,
		upstreamTiming: {
			fetch,
			timingFor: (response) => base?.timingFor(originals.get(response) ?? response),
		},
	};
}
