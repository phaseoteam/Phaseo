import { isEnvelope, type Envelope } from "./envelope";

/**
 * Phaseo Connect's own frames, beside the envelopes it forwards. The desktop socket is
 * `wss://connect.phaseo.app/v1/desktop/:desktopId` (Authorization: Bearer <Phaseo gateway key>); a phone's is
 * `/v1/phone/:desktopId` (Authorization: Bearer <relay token>). Envelopes travel as they are, addressed by `to`; the
 * relay forwards them unchanged, holding `attention`, `send` and `answer_*` envelopes for a device that is offline.
 */
export type RelayDesktopFrame =
	/** Lets a phone sign in with this relay token, by its SHA-256 hex. Sent again on every reconnect; repeating it is harmless. */
	| { type: "register_device"; deviceId: string; relayTokenHash: string }
	/** Revokes the device at once and closes its socket. */
	| { type: "remove_device"; deviceId: string }
	| Envelope;
/** Hold marks the envelopes worth keeping for an offline phone; live entries are dropped and the phone reads the chat again. */
export type RelayOutbound = Envelope & { hold?: true };
export type RelayServerFrame =
	| { type: "error"; code: "unauthorized" | "not_entitled" | "unpaid" | "wrong_workspace" | "invalid_frame" | "unknown_device"; message: string }
	| { type: "device_online" | "device_offline"; deviceId: string }
	| Envelope;

export const connectRelayUrl = "wss://connect.phaseo.app";
export const relayDesktopUrl = (relayUrl: string, desktopId: string) => `${relayUrl.replace(/\/+$/, "")}/v1/desktop/${encodeURIComponent(desktopId)}`;
export const relayPhoneUrl = (relayUrl: string, desktopId: string) => `${relayUrl.replace(/\/+$/, "")}/v1/phone/${encodeURIComponent(desktopId)}`;

/** A frame from the relay, or undefined for anything unrecognised (a newer relay may add frames). */
export function parseRelayFrame(text: string): RelayServerFrame | undefined {
	let value: unknown;
	try { value = JSON.parse(text); } catch { return undefined; }
	if (isEnvelope(value)) return value;
	if (!value || typeof value !== "object") return undefined;
	const frame = value as Record<string, unknown>;
	if (frame.type === "error" && typeof frame.code === "string" && typeof frame.message === "string") return frame as RelayServerFrame;
	if ((frame.type === "device_online" || frame.type === "device_offline") && typeof frame.deviceId === "string") return frame as RelayServerFrame;
	return undefined;
}
