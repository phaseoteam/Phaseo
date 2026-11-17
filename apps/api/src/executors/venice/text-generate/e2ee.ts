// Purpose: Venice end-to-end encryption (E2EE) for `e2ee-*` models served through the `venice-e2ee` provider.
// Why: Venice relays only ciphertext to an attested TEE when the client encrypts the conversation. Without this
//      the route could not run at all (the adapter refused it), and a plaintext call would lose the guarantee.
// How: Wraps the executor's upstream fetch. For the provider call only it
//      1. fetches the model's TEE attestation with a fresh 32-byte nonce and requires `verified: true`, a matching
//         nonce, no debug flag and a signing key (cached per model for a few minutes),
//      2. encrypts the content of every system, developer, user, assistant and tool message for the enclave
//         (secp256k1 ECDH -> HKDF-SHA256 -> AES-256-GCM),
//      3. sends Venice's `X-Venice-TEE-*` headers with a per-request ephemeral client key, and
//      4. returns a response whose encrypted chunks are decrypted before the shared OpenAI parser reads them.
// Protocol: https://docs.venice.ai/guides/features/tee-e2ee-models.md (fetched 2026-11-17).
// Behaviour checked against Venice's live enclave on 2026-11-17 (e2ee-qwen-2-5-7b-p, e2ee-glm-5-3-flash):
//   - plaintext assistant content -> 400 "E2EE decryption failed"; encrypted -> decrypted and used.
//   - plaintext tool content -> 400 "Encrypted field is not valid hex"; encrypted -> decrypted and used.
//   - tool-call `arguments` are NOT decrypted by the enclave (the model sees the hex), so they stay plaintext,
//     like the tool definitions Venice documents as unencrypted.

import { secp256k1 } from "@noble/curves/secp256k1";
import type { ExecutorExecuteArgs, ExecutorResult, ExecutorUpstreamTiming } from "@executors/types";

const HKDF_INFO = new TextEncoder().encode("ecdsa_encryption");
/** ephemeral public key (65) + AES-GCM nonce (12) + tag (16) bytes, hex encoded. */
const MIN_ENCRYPTED_HEX_LENGTH = 186;
const ATTESTATION_TTL_MS = 5 * 60 * 1000;
const ATTESTATION_TIMEOUT_MS = 10_000;
/** Roles whose `content` Venice's enclave decrypts. A developer turn is sent as system. */
const ENCRYPTED_ROLES = new Set(["system", "developer", "user", "assistant", "tool"]);
/** Reasoning echoed back in history is not part of Venice's encrypted fields, so it is not sent. */
const UNENCRYPTED_HISTORY_FIELDS = ["reasoning_content", "reasoning", "reasoning_details"] as const;

export class VeniceE2EEError extends Error {
	constructor(code: string, detail?: string) {
		super(detail ? `${code}: ${detail}` : code);
		this.name = "VeniceE2EEError";
	}
}

type JsonObject = Record<string, unknown>;

type ChatMessage = JsonObject & { role?: unknown; content?: unknown };

type ChatBody = JsonObject & { model?: unknown; messages?: unknown; stream?: unknown };

type Attestation = {
	verified?: unknown;
	nonce?: unknown;
	signing_key?: unknown;
	signing_public_key?: unknown;
	debug?: unknown;
	debug_mode?: unknown;
	tdx_debug?: unknown;
	is_debug?: unknown;
};

type CachedModelKey = { modelPublicKeyHex: string; expiresAt: number };
const attestedKeys = new Map<string, CachedModelKey>();

/** Test hook: forget cached attestations. */
export function resetVeniceE2EEAttestationCache(): void {
	attestedKeys.clear();
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

/** Text of a message's content. Parts are concatenated as written, with no separator added. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (content == null) return "";
	if (Array.isArray(content)) {
		let text = "";
		for (const part of content) {
			if (typeof part === "string") text += part;
			else if (isObject(part) && part.type === "text" && typeof part.text === "string") text += part.text;
			else throw new VeniceE2EEError("venice_e2ee_unsupported_content", `E2EE carries text only, got ${isObject(part) ? String(part.type ?? "unknown") : typeof part}`);
		}
		return text;
	}
	throw new VeniceE2EEError("venice_e2ee_unsupported_content");
}

async function encryptMessage(message: ChatMessage, modelPublicKey: Uint8Array): Promise<ChatMessage> {
	const role = String(message.role ?? "");
	if (!ENCRYPTED_ROLES.has(role)) {
		throw new VeniceE2EEError("venice_e2ee_unsupported_content", `cannot encrypt a ${role || "role-less"} message`);
	}
	const next: ChatMessage = { ...message, role: role === "developer" ? "system" : role };
	for (const field of UNENCRYPTED_HISTORY_FIELDS) delete next[field];
	// An assistant tool-call turn may carry no content; Venice accepts it omitted, and encrypting nothing would
	// invent an empty answer. Every other role always has content to encrypt.
	if (role === "assistant" && (message.content === null || message.content === undefined)) {
		delete next.content;
		return next;
	}
	next.content = await encryptForModel(messageText(message.content), modelPublicKey);
	return next;
}

/**
 * Encrypts the content of every message. Venice's enclave decrypts system, user, assistant and tool content and
 * rejects plaintext in those fields once the E2EE headers are sent. Tool definitions and tool-call arguments stay
 * plaintext because the enclave does not decrypt them.
 */
export async function encryptChatMessages(body: ChatBody, modelPublicKey: Uint8Array): Promise<ChatBody> {
	const messages = Array.isArray(body.messages) ? body.messages : [];
	const encrypted: ChatMessage[] = [];
	for (const message of messages) {
		if (!isObject(message)) throw new VeniceE2EEError("venice_e2ee_unsupported_content");
		encrypted.push(await encryptMessage(message, modelPublicKey));
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

function attestationDeclaresDebug(attestation: Attestation): boolean {
	return [attestation.debug, attestation.debug_mode, attestation.tdx_debug, attestation.is_debug].some((value) => value === true);
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
	const parsed: unknown = await response.json().catch(() => null);
	const attestation: Attestation = isObject(parsed) ? parsed : {};
	if (attestation.verified !== true) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "not verified");
	if (String(attestation.nonce ?? "").toLowerCase() !== nonce) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "nonce mismatch");
	if (attestationDeclaresDebug(attestation)) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "debug enclave");
	const modelPublicKeyHex = attestation.signing_key ?? attestation.signing_public_key;
	if (typeof modelPublicKeyHex !== "string" || !modelPublicKeyHex) throw new VeniceE2EEError("venice_e2ee_attestation_failed", "no signing key");
	normalizePublicKey(modelPublicKeyHex);
	attestedKeys.set(cacheKey, { modelPublicKeyHex, expiresAt: now + ATTESTATION_TTL_MS });
	return modelPublicKeyHex;
}

async function decryptField(holder: unknown, field: string, clientPrivateKey: Uint8Array, keyCache: Map<string, CryptoKey>): Promise<boolean> {
	if (!isObject(holder) || !looksEncrypted(holder[field])) return false;
	const plain = await decryptFromModel(holder[field] as string, clientPrivateKey, keyCache);
	if (plain === null) return false;
	holder[field] = plain;
	return true;
}

async function decryptChoiceFields(payload: unknown, clientPrivateKey: Uint8Array, keyCache: Map<string, CryptoKey>): Promise<boolean> {
	if (!isObject(payload) || !Array.isArray(payload.choices)) return false;
	let changed = false;
	for (const choice of payload.choices) {
		if (!isObject(choice)) continue;
		for (const holder of [choice.delta, choice.message]) {
			if (!isObject(holder)) continue;
			for (const field of ["content", "reasoning_content", "reasoning"]) {
				changed = (await decryptField(holder, field, clientPrivateKey, keyCache)) || changed;
			}
			for (const call of Array.isArray(holder.tool_calls) ? holder.tool_calls : []) {
				if (isObject(call)) changed = (await decryptField(call.function, "arguments", clientPrivateKey, keyCache)) || changed;
			}
		}
	}
	return changed;
}

/** Returns a Response with the same status and headers whose encrypted chunks are decrypted. */
export function decryptingResponse(response: Response, clientPrivateKey: Uint8Array): Response {
	const keyCache = new Map<string, CryptoKey>();
	const contentType = response.headers.get("content-type") ?? "";
	const upstreamBody = response.body;
	if (!upstreamBody) return response;

	if (!contentType.includes("text/event-stream")) {
		const stream = new ReadableStream<Uint8Array>({
			async start(controller) {
				const text = await response.text();
				let out = text;
				try {
					const json: unknown = JSON.parse(text);
					if (await decryptChoiceFields(json, clientPrivateKey, keyCache)) out = JSON.stringify(json);
				} catch {
					// Not JSON: pass through unchanged.
				}
				controller.enqueue(new TextEncoder().encode(out));
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
			const json: unknown = JSON.parse(data);
			return (await decryptChoiceFields(json, clientPrivateKey, keyCache)) ? `data: ${JSON.stringify(json)}` : line;
		} catch {
			// A malformed event is passed through for the shared parser to handle as it would any provider's.
			return line;
		}
	};
	const transform = new TransformStream<Uint8Array, Uint8Array>({
		async transform(chunk, controller) {
			buffered += decoder.decode(chunk, { stream: true });
			const lines = buffered.split("\n");
			buffered = lines.pop() ?? "";
			const out: string[] = [];
			for (const line of lines) {
				const carriage = line.endsWith("\r");
				const rewritten = await rewriteLine(carriage ? line.slice(0, -1) : line);
				out.push(carriage ? `${rewritten}\r` : rewritten);
			}
			if (out.length > 0) controller.enqueue(encoder.encode(`${out.join("\n")}\n`));
		},
		async flush(controller) {
			buffered += decoder.decode();
			if (buffered) controller.enqueue(encoder.encode(await rewriteLine(buffered)));
		},
	});
	// pipeThrough propagates a downstream cancel to the upstream body, so the provider connection closes.
	return new Response(upstreamBody.pipeThrough(transform), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

/** Executor args whose provider fetch runs Venice's E2EE protocol, plus the mapping back to tracked responses. */
export type VeniceE2EEExecution = {
	args: ExecutorExecuteArgs;
	/**
	 * Replaces a decrypting response in the executor result with the response the pipeline's upstream tracker
	 * recorded, so selected dispatch and header timing (which exclude the attestation preflight) still resolve.
	 * The stream or IR was already read from the decrypting response.
	 */
	restoreTrackedUpstream: (result: ExecutorResult) => ExecutorResult;
};

/**
 * Wraps the executor's upstream fetch with Venice's E2EE protocol. Attestation calls are recorded as preflight
 * fetches; timing lookups on the decrypting response resolve to the original upstream response.
 */
export function withVeniceE2EE(args: ExecutorExecuteArgs): VeniceE2EEExecution {
	const base = args.upstreamTiming;
	const baseFetch: ExecutorUpstreamTiming["fetch"] = base
		? base.fetch
		: (input, init) => globalThis.fetch(input, init);
	const originals = new WeakMap<Response, Response>();

	const fetch: ExecutorUpstreamTiming["fetch"] = async (input, init, phase = "provider") => {
		if (phase !== "provider") return baseFetch(input, init, phase);
		const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		if (typeof init?.body !== "string") throw new VeniceE2EEError("venice_e2ee_unsupported_request");
		const parsed: unknown = JSON.parse(init.body);
		if (!isObject(parsed)) throw new VeniceE2EEError("venice_e2ee_unsupported_request");
		const body: ChatBody = parsed;
		const authorization = new Headers(init.headers ?? {}).get("authorization");
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
		args: {
			...args,
			upstreamTiming: {
				fetch,
				timingFor: (response) => base?.timingFor(originals.get(response) ?? response),
			},
		},
		restoreTrackedUpstream: (result) => {
			const original = result.upstream ? originals.get(result.upstream) : undefined;
			return original ? { ...result, upstream: original } as ExecutorResult : result;
		},
	};
}
