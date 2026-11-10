import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import { fromBase64url, fromUtf8, toBase64url, utf8 } from "./base64url";
import { phoneLimits, PhoneProtocolError } from "./frames";
import { relayPairingPrefix, type Envelope } from "./relay";

/**
 * Phaseo Connect's end-to-end encryption. Each phone and the desktop hold an X25519 key pair; their shared secret goes
 * through HKDF-SHA256 (info phaseo-connect-v1) to one XChaCha20-Poly1305 key. The relay forwards envelopes and can read
 * only their routing fields, which are bound into each ciphertext so it can't move one to another device or position.
 * Random bytes come from crypto.getRandomValues; React Native needs it polyfilled (expo-crypto) before this loads.
 */
export type KeyPair = { publicKey: string; privateKey: string };

const info = utf8("phaseo-connect-v1");
const pairInfo = utf8("phaseo-connect-pair-v1");

export function generateKeyPair(): KeyPair {
	const privateKey = x25519.utils.randomPrivateKey();
	return { publicKey: toBase64url(x25519.getPublicKey(privateKey)), privateKey: toBase64url(privateKey) };
}
export const publicKeyOf = (privateKey: string) => toBase64url(x25519.getPublicKey(fromBase64url(privateKey)));
export const randomToken = (bytes = 32) => toBase64url(randomBytes(bytes));
/** Hex SHA-256 of a token: what the desktop keeps of device tokens and what the relay keeps of relay tokens. */
export const tokenHash = (token: string) => bytesToHex(sha256(utf8(token)));

/** The key both sides derive: X25519(own private key, other public key), then HKDF-SHA256. */
export function sharedKey(privateKey: string, publicKey: string): Uint8Array {
	const other = fromBase64url(publicKey);
	if (other.length !== 32) throw new Error("Invalid public key.");
	return hkdf(sha256, x25519.getSharedSecret(fromBase64url(privateKey), other), undefined, info, 32);
}

/**
 * A pairing over Phaseo Connect: the relay token and the pseudo device id a phone signs in with before it has a device
 * id. Both come from the pairing code one way, so the relay, which sees them, can't recover the code inside the pair frame.
 */
export function relayPairing(pairingCode: string) {
	const token = toBase64url(hkdf(sha256, fromBase64url(pairingCode), undefined, pairInfo, 32));
	return { relayToken: token, deviceId: `${relayPairingPrefix}${tokenHash(token).slice(0, 24)}` };
}

const header = (to: string, from: string, seq: number) => utf8(`${to}\n${from}\n${seq}`);

export function sealEnvelope(key: Uint8Array, route: { to: string; from: string; seq: number }, plaintext: string): Envelope {
	const nonce = randomBytes(24);
	const ciphertext = xchacha20poly1305(key, nonce, header(route.to, route.from, route.seq)).encrypt(utf8(plaintext));
	return { to: route.to, from: route.from, seq: route.seq, nonce: toBase64url(nonce), ciphertext: toBase64url(ciphertext) };
}

/** The plaintext, or a PhoneProtocolError when the envelope was changed, is for someone else, or is too large. */
export function openEnvelope(key: Uint8Array, envelope: Envelope): string {
	// Base64url grows bytes by 4/3; the tag adds 16.
	if (envelope.ciphertext.length > Math.ceil((phoneLimits.frameBytes + 16) * 4 / 3)) throw new PhoneProtocolError("too_large", "Frames are limited to 1 MiB.");
	try {
		const nonce = fromBase64url(envelope.nonce);
		if (nonce.length !== 24) throw new Error();
		return fromUtf8(xchacha20poly1305(key, nonce, header(envelope.to, envelope.from, envelope.seq)).decrypt(fromBase64url(envelope.ciphertext)));
	} catch { throw new PhoneProtocolError("unauthorized", "This envelope could not be opened."); }
}

/**
 * One direction-pair of envelopes between this side and one peer. Sequence numbers start from the clock so they keep
 * rising across restarts, and an envelope at or below the last one opened is refused as a replay.
 */
export class EnvelopeChannel {
	private next: number;
	private lastOpened = -1;
	constructor(private readonly key: Uint8Array, readonly self: string, readonly peer: string, now: () => number = Date.now) { this.next = now() * 1000; }
	seal(frame: unknown): Envelope { return sealEnvelope(this.key, { to: this.peer, from: this.self, seq: this.next++ }, JSON.stringify(frame)); }
	open(envelope: Envelope): string {
		if (envelope.to !== this.self || envelope.from !== this.peer) throw new PhoneProtocolError("unauthorized", "This envelope is for someone else.");
		if (envelope.seq <= this.lastOpened) throw new PhoneProtocolError("unauthorized", "This envelope was already delivered.");
		const text = openEnvelope(this.key, envelope);
		this.lastOpened = envelope.seq;
		return text;
	}
}
