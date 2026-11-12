// The secret of a key approved for an API key request (POST /v1/key-requests) is held in the database only
// until the requester collects it, encrypted with AES-GCM under a key derived (HKDF-SHA-256) from the key
// pepper, with the request id as the HKDF info and in the additional data, so a ciphertext only opens for
// its own request. web-api encrypts it when the person approves (apps/web-api/src/lib/keyRequestSecret.ts,
// the same code); the gateway decrypts it on pickup, trying the previous pepper too across a rotation.

const VERSION = "v1";
const SALT = new TextEncoder().encode("phaseo-api-key-request-secret-v1");

function bytes(value: Uint8Array): ArrayBuffer {
	return new Uint8Array(value).buffer;
}

function toBase64Url(value: Uint8Array): string {
	let binary = "";
	for (const byte of value) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(base64);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function secretKey(pepper: string, requestId: string, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const material = await crypto.subtle.importKey("raw", bytes(encoder.encode(pepper)), "HKDF", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: bytes(SALT), info: bytes(encoder.encode(requestId)) },
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		[usage],
	);
}

function additionalData(requestId: string): ArrayBuffer {
	return bytes(new TextEncoder().encode(`api_key_request:${requestId}`));
}

export async function encryptKeyRequestSecret(
	pepper: string,
	requestId: string,
	plaintext: string,
	iv: Uint8Array = crypto.getRandomValues(new Uint8Array(12)),
): Promise<string> {
	if (!pepper.trim()) throw new Error("key_pepper_unavailable");
	const key = await secretKey(pepper.trim(), requestId, "encrypt");
	const ciphertext = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: bytes(iv), additionalData: additionalData(requestId) },
		key,
		bytes(new TextEncoder().encode(plaintext)),
	);
	return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** The plaintext, or null when no pepper opens it (or it isn't for this request). */
export async function decryptKeyRequestSecret(peppers: string[], requestId: string, sealed: string): Promise<string | null> {
	const [version, iv, ciphertext] = sealed.split(".");
	if (version !== VERSION || !iv || !ciphertext) return null;
	for (const pepper of peppers.map((value) => value.trim()).filter(Boolean)) {
		try {
			const key = await secretKey(pepper, requestId, "decrypt");
			const plaintext = await crypto.subtle.decrypt(
				{ name: "AES-GCM", iv: bytes(fromBase64Url(iv)), additionalData: additionalData(requestId) },
				key,
				bytes(fromBase64Url(ciphertext)),
			);
			return new TextDecoder().decode(plaintext);
		} catch {
			// Try the next pepper.
		}
	}
	return null;
}
