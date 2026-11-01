import { fromBase64url, fromUtf8, toBase64url, utf8 } from "./base64url";

/**
 * What the desktop's QR code (and its phaseo://pair link) carries. pairingCode is 32 random bytes, single use, for ten
 * minutes; desktopPublicKey is the desktop's long-lived X25519 key. direct lists the URLs the phone may try first;
 * connect is there when Phaseo Connect is on.
 */
export type PairingPayload = { v: 1; desktopId: string; desktopName: string; pairingCode: string; desktopPublicKey: string; direct: string[]; connect?: { relayUrl: string; desktopId: string } };
/** What the phone sends to POST /pair, or in a pair frame over Phaseo Connect. */
export type PairRequest = { pairingCode: string; deviceName: string; devicePublicKey: string };
/**
 * What the phone keeps. relayToken signs in to Phaseo Connect's relay, which keeps only its hash; the desktop itself is
 * reached by proving the paired key (see direct.ts), so there is no token for direct connections.
 */
export type PairResult = { deviceId: string; relayToken: string; desktopId: string; desktopName: string };

export const pairingCodeBytes = 32;
export const pairingLifetimeMs = 10 * 60_000;
const linkPrefix = "phaseo://pair?p=";
const key32 = (value: unknown) => { if (typeof value !== "string") return false; try { return fromBase64url(value).length === 32; } catch { return false; } };
const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const url = (value: unknown, protocols: string[]) => { if (typeof value !== "string" || value.length > 500) return false; try { return protocols.includes(new URL(value).protocol); } catch { return false; } };

export function validatePairingPayload(value: unknown): PairingPayload {
	if (!plain(value) || value.v !== 1) throw new Error("This pairing code is from a newer or unknown version of Phaseo.");
	const connect = value.connect;
	if (!text(value.desktopId, 100) || !text(value.desktopName, 100) || !key32(value.pairingCode) || !key32(value.desktopPublicKey)
		|| !Array.isArray(value.direct) || value.direct.length > 10 || value.direct.some(entry => !url(entry, ["http:", "https:"]))
		|| (connect !== undefined && (!plain(connect) || !url(connect.relayUrl, ["wss:", "ws:"]) || connect.desktopId !== value.desktopId))) throw new Error("This pairing code is damaged.");
	return { v: 1, desktopId: value.desktopId as string, desktopName: value.desktopName as string, pairingCode: value.pairingCode as string, desktopPublicKey: value.desktopPublicKey as string, direct: value.direct as string[],
		...plain(connect) ? { connect: { relayUrl: connect.relayUrl as string, desktopId: connect.desktopId as string } } : {} };
}

export const encodePairingLink = (payload: PairingPayload) => linkPrefix + toBase64url(utf8(JSON.stringify(validatePairingPayload(payload))));

/** The payload in a phaseo://pair link (or the bare base64url text a QR scanner returns). */
export function decodePairingLink(link: string): PairingPayload {
	const encoded = link.startsWith(linkPrefix) ? link.slice(linkPrefix.length) : link;
	let value: unknown;
	try { value = JSON.parse(fromUtf8(fromBase64url(encoded))); } catch { throw new Error("This pairing code is damaged."); }
	return validatePairingPayload(value);
}

export function validatePairRequest(value: unknown): PairRequest {
	if (!plain(value) || !key32(value.pairingCode) || !key32(value.devicePublicKey) || !text(value.deviceName, 80)) throw new Error("Invalid pairing request.");
	return { pairingCode: value.pairingCode as string, deviceName: (value.deviceName as string).trim(), devicePublicKey: value.devicePublicKey as string };
}

export function validatePairResult(value: unknown): PairResult {
	if (!plain(value) || !text(value.deviceId, 100) || !text(value.relayToken, 200) || !text(value.desktopId, 100) || !text(value.desktopName, 100)) throw new Error("The desktop returned an invalid pairing response.");
	return { deviceId: value.deviceId as string, relayToken: value.relayToken as string, desktopId: value.desktopId as string, desktopName: value.desktopName as string };
}
