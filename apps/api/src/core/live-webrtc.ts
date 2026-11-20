// Purpose: GPT Live over WebRTC with optional standby.
// Why: The browser sends media straight to OpenAI (no relay hop, standby billed at the lower rate),
//   while the relay Durable Object keeps billing ownership through OpenAI's sideband WebSocket.
// How: The gateway passes the browser's SDP offer to the relay, which creates the session with our
//   key, returns OpenAI's SDP answer and attaches the sideband for usage, policy and close.
// https://developers.openai.com/api/docs/guides/voice-webrtc?api=live
// https://developers.openai.com/api/docs/guides/live-server-controls
import { liveStartEvent, type LiveConfig } from "./live-sessions";

export const LIVE_SESSIONS_URL = "https://api.openai.com/v1/live/sessions";
export const LIVE_WEBRTC_MAX_SDP_BYTES = 64 * 1024;
export const LIVE_IDLE_TIMEOUT_MIN_S = 5;
export const LIVE_IDLE_TIMEOUT_MAX_S = 60;
// Standby defaults used by the playground (the API leaves standby off unless asked).
export const LIVE_PLAYGROUND_IDLE_TIMEOUT_S = 30;

// The browser's data channel is an untrusted frontend: it may end or mute the call, never
// change the session (backend model, tier, tools or instructions are fixed by the gateway).
// Server events stay at OpenAI's default (all), so transcripts and standby events reach it.
export const LIVE_WEBRTC_ALLOWED_CLIENT_EVENTS = ["session.close", "session.input_audio.mute", "session.input_audio.unmute"] as const;

export type LiveTransport = "websocket" | "webrtc";
export type LiveStandbyOptions = {
	wake_policy?: { type: "speech"; vad_threshold?: number };
	idle_timeout_s?: number;
};

export function liveSidebandUrl(liveSessionId: string): string {
	return `wss://api.openai.com/v1/live/sessions/${encodeURIComponent(liveSessionId)}/attach`;
}

export function liveHangupUrl(liveSessionId: string): string {
	return `${LIVE_SESSIONS_URL}/${encodeURIComponent(liveSessionId)}/hangup`;
}

/** Why an SDP offer is refused before any credit is held, or null when it looks like a browser offer. */
export function liveSdpOfferError(sdp: string): string | null {
	if (new TextEncoder().encode(sdp).byteLength > LIVE_WEBRTC_MAX_SDP_BYTES) return "live_webrtc_sdp_too_large";
	// SDP is line-based ASCII (RFC 8866): v=0 first, then <type>=<value> lines.
	if (!/^v=0\r?\n/.test(sdp) || /[^\x20-\x7E\r\n\t]/.test(sdp)) return "live_webrtc_sdp_invalid";
	const lines = sdp.split(/\r?\n/).filter(Boolean);
	if (lines.some((line) => !/^[a-z]=/.test(line))) return "live_webrtc_sdp_invalid";
	if (!lines.some((line) => line.startsWith("m=audio "))) return "live_webrtc_sdp_audio_missing";
	return null;
}

/**
 * The create request for a WebRTC Live session: the same configuration as the WebSocket
 * session.start (model, voice, instructions, store false and Responses delegation), without
 * an audio format (negotiated over SDP), plus standby and the data channel limits.
 */
export function liveWebRTCCreateBody(args: {
	config: LiveConfig;
	voice: string;
	instructions?: string;
	model: string;
	standby?: LiveStandbyOptions;
	sdp: string;
}) {
	const { session } = liveStartEvent(args.config, args.voice, args.instructions, args.model);
	const { format: _format, ...audio } = session.audio;
	return {
		session: {
			...session,
			audio,
			...(args.standby?.wake_policy ? { wake_policy: args.standby.wake_policy } : {}),
			...(args.standby?.idle_timeout_s != null ? { idle_timeout_s: args.standby.idle_timeout_s } : {}),
			client: { data_channel: { allowed_client_events: [...LIVE_WEBRTC_ALLOWED_CLIENT_EVENTS] } },
		},
		transport: { type: "webrtc" as const, sdp: args.sdp },
	};
}

/** OpenAI's 201 body: { session: { id }, transport: { type: "webrtc", sdp } }. */
export function parseLiveWebRTCCreateResponse(body: unknown): { liveSessionId: string; sdp: string } | null {
	const record = body && typeof body === "object" ? body as Record<string, any> : null;
	const id = record?.session?.id;
	const sdp = record?.transport?.sdp;
	if (typeof id !== "string" || !/^[\w-]{1,128}$/.test(id)) return null;
	if (typeof sdp !== "string" || !/^v=0\r?\n/.test(sdp) || sdp.length > LIVE_WEBRTC_MAX_SDP_BYTES) return null;
	return { liveSessionId: id, sdp };
}

/**
 * How a WebRTC session ended when OpenAI closed it without the gateway asking. The browser
 * ending the call (session.close on the data channel, or closing the peer connection) is the
 * normal end of a WebRTC call, not a failure.
 */
export function liveWebRTCCloseReason(reason: string): string {
	if (reason === "close_requested" || reason === "remote_hangup") return "client_requested_end";
	if (reason === "connection_lost") return "client_disconnected";
	if (reason === "expired") return "live_session_expired";
	return "live_session_closed";
}

/** Sideband frames the relay never needs: reflected audio (no event_id, large and frequent). */
export function isLiveSidebandAudioEvent(type: string): boolean {
	return type.endsWith("audio.delta") || type === "session.input_audio.append" || type.endsWith("audio_buffer.append");
}
