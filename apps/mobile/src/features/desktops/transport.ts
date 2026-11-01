import { EnvelopeChannel, parseDesktopFrame, parseRelayFrame, relayPhoneUrl, sharedKey, type DesktopFrame, type PhoneFrame } from "./protocol";

/** The parts of a WebSocket the transports use, so tests can hand them a fake desktop. */
export type SocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
};
/** Opens a socket signed in with `Authorization: Bearer <token>`. */
export type OpenSocket = (url: string, token: string) => SocketLike;

export type TransportKind = "direct" | "connect";
/** Why a link closed. `refused` means trying again won't help until something changes (the phone was removed, Connect is off). */
export type LinkClosed = { refused?: string };
export type LinkEvents = { frame(frame: DesktopFrame): void; closed(reason: LinkClosed): void };
export type Link = { send(frame: PhoneFrame): void; close(): void };
/** One way to reach a desktop. The client and the screens don't know which one they have. */
export type DesktopTransport = { kind: TransportKind; open(events: LinkEvents): Promise<Link> };

/** Requests worth keeping for a desktop that's offline; Phaseo Connect holds envelopes marked so. */
const heldTypes = new Set(["send", "answer_approval", "answer_question"]);
export const isHeld = (frame: PhoneFrame) => heldTypes.has(frame.type);

const removedMessage = "This phone was removed on the computer. Pair it again.";

/** ws(s)://…/v1/phone for a direct URL (http → ws, https → wss). */
export const directSocketUrl = (url: string) => `${url.replace(/\/+$/, "").replace(/^http/i, "ws")}/v1/phone`;

/** Resolves once the socket opens; a socket that closes first rejects. */
function opened(socket: SocketLike, events: LinkEvents, receive: (text: string) => void, send: (frame: PhoneFrame) => void, onClose?: (event: { code?: number }) => LinkClosed) {
  return new Promise<Link>((resolve, reject) => {
    let open = false, done = false;
    const finish = (reason: LinkClosed) => { if (done) return; done = true; events.closed(reason); };
    socket.onopen = () => {
      open = true;
      resolve({ send, close: () => { socket.close(1000, "Closed"); finish({}); } });
    };
    socket.onmessage = (event) => { if (typeof event.data === "string") receive(event.data); };
    socket.onerror = () => { /* onclose follows */ };
    socket.onclose = (event) => {
      if (!open) { done = true; reject(new Error("Couldn't connect.")); return; }
      finish(onClose?.(event) ?? {});
    };
  });
}

/** Same Wi-Fi or a tailnet: frames go as they are, over the desktop's own phone server. */
export function directTransport({ url, deviceToken, openSocket }: { url: string; deviceToken: string; openSocket: OpenSocket }): DesktopTransport {
  return {
    kind: "direct",
    open(events) {
      const socket = openSocket(directSocketUrl(url), deviceToken);
      const receive = (text: string) => {
        let frame: DesktopFrame;
        try { frame = parseDesktopFrame(text); } catch { return; }
        events.frame(frame);
      };
      // The desktop closes a removed phone's sockets with 4401.
      return opened(socket, events, receive, (frame) => socket.send(JSON.stringify(frame)), (event) => (event.code === 4401 ? { refused: removedMessage } : {}));
    },
  };
}

const relayRefusals: Record<string, string> = {
  unauthorized: removedMessage,
  unknown_device: removedMessage,
  not_entitled: "Phaseo Connect is off for this computer. Turn it on in Settings → Phone on the computer.",
  unpaid: "Phaseo Connect is paused until this month's charge is paid. Add credits on phaseo.app.",
  wrong_workspace: "This computer now uses another Phaseo workspace. Pair it again.",
};

export type RelayCredentials = { relayUrl: string; desktopId: string; deviceId: string; relayToken: string; privateKey: string; desktopPublicKey: string };

/**
 * Phaseo Connect: the same frames, sealed end to end in envelopes the relay can't read. Envelopes are opened in the
 * order they arrive; the channel refuses one that repeats or goes backwards.
 */
export function relayTransport({ credentials, openSocket }: { credentials: RelayCredentials; openSocket: OpenSocket }): DesktopTransport {
  const { relayUrl, desktopId, deviceId, relayToken, privateKey, desktopPublicKey } = credentials;
  return {
    kind: "connect",
    open(events) {
      const channel = new EnvelopeChannel(sharedKey(privateKey, desktopPublicKey), deviceId, desktopId);
      const socket = openSocket(relayPhoneUrl(relayUrl, desktopId), relayToken);
      let refused: string | undefined;
      const receive = (text: string) => {
        const frame = parseRelayFrame(text);
        if (!frame) return;
        if ("ciphertext" in frame) {
          let desktop: DesktopFrame;
          try { desktop = parseDesktopFrame(channel.open(frame)); } catch { return; }
          events.frame(desktop);
        } else if (frame.type === "error" && relayRefusals[frame.code]) {
          refused = relayRefusals[frame.code];
          socket.close(4000, frame.code);
        }
      };
      const send = (frame: PhoneFrame) => {
        const envelope = channel.seal(frame);
        socket.send(JSON.stringify(isHeld(frame) ? { ...envelope, hold: true } : envelope));
      };
      return opened(socket, events, receive, send, () => (refused ? { refused } : {}));
    },
  };
}

/** The real socket: React Native's WebSocket takes headers as its third argument. */
export const openNativeSocket: OpenSocket = (url, token) => {
  const NativeSocket = WebSocket as unknown as new (url: string, protocols: undefined, options: { headers: Record<string, string> }) => SocketLike;
  return new NativeSocket(url, undefined, { headers: { Authorization: `Bearer ${token}` } });
};
