// Purpose: Browser helper for GPT Live over WebRTC.
// Why: The offer/answer exchange, ICE gathering and data-channel wait are the same for every app.
// How: Builds the peer connection and OpenAI's `oai-events` data channel, hands the SDP offer to
//      your server (which creates the session with its API key) and applies the SDP answer.

import type { RealtimeSessionInfo } from "./realtime.js";

/** A GPT Live create response with `transport.type` `webrtc`. */
export type LiveWebRTCSessionInfo = RealtimeSessionInfo & {
  transport?: { type?: string; sdp?: string; [key: string]: unknown };
};

export type LiveWebRTCConnectOptions = {
  /**
   * Sends the SDP offer to your server, which calls `POST /v1/live/sessions` with
   * `transport: { type: "webrtc", sdp }` (and standby options) and returns the response.
   * Your API key never reaches the browser.
   */
  createSession: (sdpOffer: string) => Promise<LiveWebRTCSessionInfo>;
  /** Microphone stream. Default: `getUserMedia({ audio: true })`, stopped when the call fails or closes. A stream you pass is never stopped. */
  stream?: MediaStream;
  /** Peer connection to use. Default: a new `RTCPeerConnection()`. */
  peerConnection?: RTCPeerConnection;
  /** Called with each server event from the data channel (transcripts, `session.paused`, ...). */
  onEvent?: (event: { type: string; [key: string]: unknown }) => void;
  /** Where the reply audio plays. Default: a new `Audio` element. */
  audioElement?: HTMLAudioElement;
  /** How long to wait for ICE gathering before sending the offer. Default 2 seconds. */
  iceGatheringTimeoutMs?: number;
  /** How long to wait for the data channel to open after the answer. Default 10 seconds. */
  connectTimeoutMs?: number;
};

export type LiveWebRTCConnection = {
  session: LiveWebRTCSessionInfo;
  peerConnection: RTCPeerConnection;
  dataChannel: RTCDataChannel;
  stream: MediaStream;
  /** Ends the call with `session.close` on the data channel, then closes the peer connection (and stops a microphone this helper opened). */
  close: () => void;
};

function waitForIceGathering(pc: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); pc.removeEventListener("icegatheringstatechange", check); resolve(); };
    const check = () => { if (pc.iceGatheringState === "complete") done(); };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

/**
 * Browser only: connects to GPT Live over WebRTC. Media goes directly to OpenAI; Phaseo bills the
 * call from OpenAI's server-side events. Phaseo's own warnings and the final bill are on
 * `GET /v1/live/sessions/{id}`, which your server can poll.
 */
export async function connectLiveWebRTC(options: LiveWebRTCConnectOptions): Promise<LiveWebRTCConnection> {
  // A microphone this helper opened is stopped when the call fails or ends; a stream the caller
  // passed in is theirs and is never stopped here.
  const ownsStream = !options.stream;
  const stream = options.stream ?? await navigator.mediaDevices.getUserMedia({ audio: true });
  const stopOwnStream = () => {
    if (!ownsStream) return;
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch { /* already stopped */ }
    }
  };
  let pc: RTCPeerConnection | null = null;
  let dataChannel: RTCDataChannel | null = null;
  const teardown = () => {
    try { dataChannel?.close(); } catch { /* already closed */ }
    try { pc?.close(); } catch { /* already closed */ }
    stopOwnStream();
  };
  try {
    const peer = options.peerConnection ?? new RTCPeerConnection();
    pc = peer;
    for (const track of stream.getAudioTracks()) peer.addTrack(track, stream);
    const audio = options.audioElement ?? (typeof Audio === "function" ? new Audio() : null);
    if (audio) audio.autoplay = true;
    peer.addEventListener("track", (event) => {
      if (audio) audio.srcObject = event.streams[0] ?? null;
    });
    const channel = peer.createDataChannel("oai-events");
    dataChannel = channel;
    channel.addEventListener("message", (message) => {
      try {
        const event = JSON.parse(String(message.data));
        if (event && typeof event.type === "string") options.onEvent?.(event);
      } catch {
        // Not JSON: nothing to report.
      }
    });
    const close = () => {
      const open = channel.readyState === "open";
      if (open) channel.send(JSON.stringify({ type: "session.close" }));
      // The microphone stops at once; the peer connection stays a moment for session.close to go out.
      stopOwnStream();
      setTimeout(teardown, open ? 1_000 : 0);
    };
    await peer.setLocalDescription(await peer.createOffer());
    await waitForIceGathering(peer, options.iceGatheringTimeoutMs ?? 2_000);
    const session = await options.createSession(peer.localDescription?.sdp ?? "");
    const answer = session.transport?.sdp;
    if (session.transport?.type !== "webrtc" || typeof answer !== "string") {
      throw new Error("The session response has no WebRTC answer (transport.sdp)");
    }
    await peer.setRemoteDescription({ type: "answer", sdp: answer });
    const timeoutMs = options.connectTimeoutMs ?? 10_000;
    if (channel.readyState !== "open") {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`GPT Live WebRTC did not connect within ${timeoutMs} ms`)), timeoutMs);
        channel.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    return { session, peerConnection: peer, dataChannel: channel, stream, close };
  } catch (error) {
    teardown();
    throw error;
  }
}
