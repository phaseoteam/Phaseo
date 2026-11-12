import { openEnvelope, randomToken, sealEnvelope, sharedKey, type EnvelopeChannel } from "./envelope";
import { PhoneProtocolError } from "./frames";
import { validatePairRequest, type PairRequest } from "./pairing";
import { isEnvelope, relayDesktopAddress, type Envelope } from "./relay";

/**
 * Direct connections (same Wi-Fi or a tailnet) are sealed like Phaseo Connect, because ws:// and http:// to a LAN or
 * Tailscale IP have no TLS. Both sides already hold each other's X25519 keys from pairing, so the phone signs in by
 * proving its key rather than with a token, and nothing secret or private crosses in the clear.
 *
 * `/v1/phone` session:
 * 1. desktop → phone, plaintext: { type: "challenge", v: 1, challenge } (32 random bytes, new for every socket).
 * 2. phone → desktop: an Envelope from its deviceId to "desktop" under the pair's shared key, holding
 *    { type: "auth", challenge, reply }, where reply is 32 random bytes of the phone's own.
 * 3. desktop → phone: its first Envelope, { type: "welcome", reply }, which proves the desktop's key to the phone.
 * After that every frame, both ways, is an Envelope on the same EnvelopeChannel pair, as over Connect. The desktop
 * closes with directCloseCodes.refused for an unknown phone or a bad proof, and when the phone is removed.
 *
 * `POST /pair`: the request is sealed to the desktop's public key from the QR code, under a key pair the phone just
 * made, so someone on the network can neither read the single-use code nor swap in their own key; the answer is
 * sealed back to that key pair, and only the desktop holding the QR's key could have sealed it.
 */
export const directCloseCodes = { refused: 4401 } as const;
export type DirectChallenge = { type: "challenge"; v: 1; challenge: string };

const challengeText = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const refuse = (message: string): never => { throw new PhoneProtocolError("unauthorized", message); };
const object = (text: string) => { try { const value = JSON.parse(text) as unknown; return value && typeof value === "object" ? value as Record<string, unknown> : {}; } catch { return {}; } };

export const directChallenge = (): DirectChallenge => ({ type: "challenge", v: 1, challenge: randomToken() });

/** The desktop's first frame, or undefined. */
export function readDirectChallenge(text: string): DirectChallenge | undefined {
	const value = object(text);
	return value.type === "challenge" && value.v === 1 && challengeText(value.challenge) ? { type: "challenge", v: 1, challenge: value.challenge } : undefined;
}

/** Phone: the sign-in envelope for a challenge, and the reply the desktop's welcome must echo. */
export function directAuth(channel: EnvelopeChannel, challenge: string) {
	const reply = randomToken();
	return { envelope: channel.seal({ type: "auth", challenge, reply }), reply };
}

/** Desktop: checks a phone's sign-in envelope on its channel and returns the welcome to seal back. */
export function checkDirectAuth(channel: EnvelopeChannel, envelope: Envelope, challenge: string) {
	const value = object(channel.open(envelope));
	if (value.type !== "auth" || value.challenge !== challenge || !challengeText(value.reply)) refuse("This phone didn't prove its key.");
	return { type: "welcome", reply: value.reply as string };
}

/** Phone: checks the desktop's first envelope. */
export function checkDirectWelcome(channel: EnvelopeChannel, envelope: Envelope, reply: string) {
	const value = object(channel.open(envelope));
	if (value.type !== "welcome" || value.reply !== reply) refuse("The computer didn't prove its key.");
}

const pairRequestRoute = { to: relayDesktopAddress, from: "pair", seq: 0 };
const pairResponseRoute = { to: "pair", from: relayDesktopAddress, seq: 1 };
const sameRoute = (envelope: Envelope, route: { to: string; from: string; seq: number }) => envelope.to === route.to && envelope.from === route.from && envelope.seq === route.seq;

export type SealedPairRequest = { devicePublicKey: string; sealed: Envelope };

/** Phone: the POST /pair body. */
export function sealPairRequest(devicePrivateKey: string, desktopPublicKey: string, request: PairRequest): SealedPairRequest {
	return { devicePublicKey: request.devicePublicKey, sealed: sealEnvelope(sharedKey(devicePrivateKey, desktopPublicKey), pairRequestRoute, JSON.stringify(request)) };
}

/** Desktop: the pairing request inside a POST /pair body; throws for anything sealed by someone else or changed. */
export function openPairRequest(desktopPrivateKey: string, body: unknown): PairRequest {
	const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
	if (typeof value.devicePublicKey !== "string" || !isEnvelope(value.sealed) || !sameRoute(value.sealed, pairRequestRoute)) throw new Error("Invalid pairing request.");
	let request: PairRequest;
	try { request = validatePairRequest(JSON.parse(openEnvelope(sharedKey(desktopPrivateKey, value.devicePublicKey), value.sealed))); } catch { throw new Error("Invalid pairing request."); }
	if (request.devicePublicKey !== value.devicePublicKey) throw new Error("Invalid pairing request.");
	return request;
}

/** Desktop: the POST /pair answer, readable only by the phone that sent the request. */
export function sealPairResponse(desktopPrivateKey: string, devicePublicKey: string, response: unknown) {
	return { sealed: sealEnvelope(sharedKey(desktopPrivateKey, devicePublicKey), pairResponseRoute, JSON.stringify(response)) };
}

/** Phone: the answer inside a sealed POST /pair response. */
export function openPairResponse(devicePrivateKey: string, desktopPublicKey: string, body: unknown): unknown {
	const sealed = body && typeof body === "object" ? (body as Record<string, unknown>).sealed : undefined;
	if (!isEnvelope(sealed) || !sameRoute(sealed, pairResponseRoute)) throw new Error("The desktop returned an invalid pairing response.");
	try { return JSON.parse(openEnvelope(sharedKey(devicePrivateKey, desktopPublicKey), sealed)); } catch { throw new Error("The desktop returned an invalid pairing response."); }
}
