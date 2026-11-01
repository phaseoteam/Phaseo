/**
 * Phaseo Connect's wire protocol, shared by the relay Worker (apps/api), the desktop and the phone. It imports no
 * crypto, so the Worker can bundle it alone through `@phaseo/phone-protocol/relay`.
 *
 * Sockets: the desktop's is `wss://connect.phaseo.app/v1/desktop/:desktopId` (Authorization: Bearer <Phaseo gateway
 * key>); a phone's is `/v1/phone/:desktopId` (Authorization: Bearer <relay token the desktop registered>).
 *
 * - Envelopes go either way as JSON text. A phone addresses the desktop as "desktop"; the desktop addresses a phone
 *   by its device id. The relay sets `from` itself from the socket's sign-in, so the sealed route must use the same
 *   names. `hold: true` keeps an envelope for an offline recipient (see relayHolds); anything else is dropped.
 * - Pairing over Connect: the phone signs in with relayPairing(code).relayToken as the device "pair-…", which the
 *   desktop registered while the code is valid, and its envelope carries `senderPublicKey`. The relay forwards that
 *   key only from "pair-…" devices, and never sees the pairing code, only a one-way token derived from it.
 * - Desktop control frames: register_device and remove_device; the relay answers { id, ok } or { id, ok: false, error }.
 * - From the relay: desktop_online / desktop_offline to phones; devices_online, device_online and device_offline to
 *   the desktop; { type: "error", error, seq? } for a frame it refused.
 * - A refused sign-in is an HTTP status before the upgrade, with { error } as the body. A session that loses the
 *   entitlement is closed with relayCloseCodes.notEntitled and the reason "payment_required" or "connect_off".
 */

/** The relay's name for the desktop in envelope routes. */
export const relayDesktopAddress = "desktop";
/** The prefix of the device id a phone pairs with over Connect, before it has a device id of its own. */
export const relayPairingPrefix = "pair-";
export const relayDeviceIdPattern = /^[A-Za-z0-9_-]{8,64}$/;
export const relayTokenHashPattern = /^[0-9a-f]{64}$/;
const noncePattern = /^[A-Za-z0-9_-]{16,64}$/;
const publicKeyPattern = /^[A-Za-z0-9_-]{43}$/;

export const relayCloseCodes = {
	/** Another socket signed in as the same desktop or device. */
	replaced: 4000,
	/** The desktop removed this phone, or rotated its token. */
	deviceRemoved: 4001,
	/** The workspace turned Connect off or has a month to pay: stop retrying until that changes. */
	notEntitled: 4402,
} as const;

export const relayLimits = {
	holdMessages: 500,
	holdBytes: 5 * 1024 * 1024,
	holdMs: 24 * 60 * 60 * 1000,
	/** A 1 MiB frame grows by a third as base64url ciphertext, plus the envelope fields. */
	messageChars: 1_500_000,
} as const;

/** An envelope as the relay delivers it. Only a pairing phone's first envelope has senderPublicKey. */
export type Envelope = { to: string; from: string; seq: number; nonce: string; ciphertext: string; senderPublicKey?: string };
/** An envelope as a client sends it: `from` is optional and ignored, because the relay sets it. */
export type RelayOutbound = Omit<Envelope, "from"> & { from?: string; hold?: boolean };
export type RelayDesktopFrame =
	/** Lets a phone sign in with this relay token, by its SHA-256 hex. Sent again on every reconnect; repeating it is harmless. */
	| { id?: string | number; type: "register_device"; deviceId: string; relayTokenHash: string }
	/** Revokes the device at once, drops what was held for it and closes its socket. */
	| { id?: string | number; type: "remove_device"; deviceId: string };
export type RelayErrorCode = "text_only" | "too_large" | "rate_limited" | "invalid_json" | "invalid_envelope" | "invalid_recipient" | "unknown_device";
export type RelayServerFrame =
	| Envelope
	| { type: "desktop_online" | "desktop_offline" }
	| { type: "devices_online"; deviceIds: string[] }
	| { type: "device_online" | "device_offline"; deviceId: string }
	| { type: "error"; error: RelayErrorCode; seq?: number }
	| { id?: string | number; ok: true }
	| { id?: string | number; ok: false; error: string };
/** The { error } body of a refused sign-in. */
export type RelayRefusal = "unauthorized" | "bad_request" | "workspace_mismatch" | "connect_off" | "payment_required" | "connect_unavailable" | "entitlement_unavailable";

/**
 * Frames worth keeping for an offline recipient: attention for the phone, and the phone's send and answers for the
 * desktop. Live entries and replies are dropped; the phone reads the chat again when it returns.
 */
export const relayHolds = (frame: { type?: unknown }) =>
	frame.type === "attention" || frame.type === "send" || frame.type === "answer_approval" || frame.type === "answer_question";

export const connectRelayUrl = "wss://connect.phaseo.app";
export const relayDesktopUrl = (relayUrl: string, desktopId: string) => `${relayUrl.replace(/\/+$/, "")}/v1/desktop/${encodeURIComponent(desktopId)}`;
export const relayPhoneUrl = (relayUrl: string, desktopId: string) => `${relayUrl.replace(/\/+$/, "")}/v1/phone/${encodeURIComponent(desktopId)}`;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function isEnvelope(value: unknown): value is Envelope {
	return record(value) && typeof value.to === "string" && typeof value.from === "string" && Number.isSafeInteger(value.seq) && (value.seq as number) >= 0
		&& typeof value.nonce === "string" && typeof value.ciphertext === "string" && (value.senderPublicKey === undefined || typeof value.senderPublicKey === "string");
}

/** A client's envelope as the relay accepts it, or undefined. Routing fields only; the ciphertext stays opaque. */
export function readRelayOutbound(value: unknown): RelayOutbound | undefined {
	if (!record(value)) return undefined;
	const { to, seq, nonce, ciphertext, hold, senderPublicKey } = value;
	if (typeof to !== "string" || !Number.isSafeInteger(seq) || (seq as number) < 0 || typeof nonce !== "string" || !noncePattern.test(nonce)
		|| typeof ciphertext !== "string" || !ciphertext || (hold !== undefined && typeof hold !== "boolean")
		|| (senderPublicKey !== undefined && (typeof senderPublicKey !== "string" || !publicKeyPattern.test(senderPublicKey)))) return undefined;
	return { to, seq: seq as number, nonce, ciphertext, ...hold ? { hold: true } : {}, ...typeof senderPublicKey === "string" ? { senderPublicKey } : {} };
}

/** A frame from the relay, or undefined for anything unrecognised (a newer relay may add frames). */
export function parseRelayFrame(text: string): RelayServerFrame | undefined {
	let value: unknown;
	try { value = JSON.parse(text); } catch { return undefined; }
	if (isEnvelope(value)) return value;
	if (!record(value)) return undefined;
	if (value.type === "desktop_online" || value.type === "desktop_offline") return { type: value.type };
	if (value.type === "devices_online" && Array.isArray(value.deviceIds) && value.deviceIds.every(id => typeof id === "string")) return { type: value.type, deviceIds: value.deviceIds as string[] };
	if ((value.type === "device_online" || value.type === "device_offline") && typeof value.deviceId === "string") return { type: value.type, deviceId: value.deviceId };
	if (value.type === "error" && typeof value.error === "string") return { type: "error", error: value.error as RelayErrorCode, ...Number.isSafeInteger(value.seq) ? { seq: value.seq as number } : {} };
	if (value.ok === true) return { id: value.id as string | number | undefined, ok: true };
	if (value.ok === false && typeof value.error === "string") return { id: value.id as string | number | undefined, ok: false, error: value.error };
	return undefined;
}
