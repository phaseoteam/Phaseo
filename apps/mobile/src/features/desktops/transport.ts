import {
  checkDirectWelcome, directAuth, directCloseCodes, EnvelopeChannel, isEnvelope, parseDesktopFrame, parseRelayFrame, readDirectChallenge, relayCloseCodes,
  relayDesktopAddress, relayHolds, relayPhoneUrl, sharedKey, type DesktopFrame, type Envelope, type PhoneFrame,
} from "./protocol";

/** The parts of a WebSocket the transports use, so tests can hand them a fake desktop. */
export type SocketLike = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
};
/** Opens a socket; with a token it signs in with `Authorization: Bearer <token>` (the relay), without one it sends no credentials (direct). */
export type OpenSocket = (url: string, token?: string) => SocketLike;

export type TransportKind = "direct" | "connect";
/** Why a link closed. `refused` means trying again won't help until something changes (the phone was removed, Connect is off). */
export type LinkClosed = { refused?: string };
export type LinkEvents = { frame(frame: DesktopFrame): void; closed(reason: LinkClosed): void };
export type Link = { send(frame: PhoneFrame): void; close(): void };
/** One way to reach a desktop. The client and the screens don't know which one they have. */
export type DesktopTransport = { kind: TransportKind; open(events: LinkEvents): Promise<Link> };
/** A link the desktop or the relay turned away before it was ready; the client stops retrying. */
export class LinkRefused extends Error {}

/** What a phone proves it is with, on either transport: its paired key pair and the desktop's public key. */
export type PairedKeys = { deviceId: string; privateKey: string; desktopPublicKey: string };

const removedMessage = "This phone was removed on the computer. Pair it again.";

/** ws(s)://…/v1/phone for a direct URL (http → ws, https → wss). */
export const directSocketUrl = (url: string) => `${url.replace(/\/+$/, "").replace(/^http/i, "ws")}/v1/phone`;

/**
 * Runs a socket until `ready` is called, then resolves with the link. A socket that closes first rejects, with
 * LinkRefused when `refusal` says why trying again won't help.
 */
function linkOver(socket: SocketLike, events: LinkEvents, handlers: { readyOnOpen?: boolean; receive(text: string, ready: () => void): void; send(frame: PhoneFrame): void; refusal(event: { code?: number; reason?: string }): string | undefined }) {
  return new Promise<Link>((resolve, reject) => {
    let ready = false, done = false;
    const finish = (reason: LinkClosed) => { if (done) return; done = true; events.closed(reason); };
    const markReady = () => {
      if (ready) return;
      ready = true;
      resolve({ send: handlers.send, close: () => { socket.close(1000, "Closed"); finish({}); } });
    };
    socket.onopen = handlers.readyOnOpen ? markReady : null;
    socket.onmessage = (event) => { if (typeof event.data === "string") handlers.receive(event.data, markReady); };
    socket.onerror = () => { /* onclose follows */ };
    socket.onclose = (event) => {
      const refused = handlers.refusal(event);
      if (!ready) { done = true; reject(refused ? new LinkRefused(refused) : new Error("Couldn't connect.")); return; }
      finish(refused ? { refused } : {});
    };
  });
}

const readEnvelope = (text: string): Envelope | undefined => { try { const value = JSON.parse(text) as unknown; return isEnvelope(value) ? value : undefined; } catch { return undefined; } };

/**
 * Same Wi-Fi or a tailnet, over the desktop's own phone server. Those addresses are plain ws://, so nothing travels in
 * the clear: the desktop sends a challenge, this phone answers with its device id and the challenge sealed under the
 * paired key, the desktop proves its own key in a sealed welcome, and every frame after that is an envelope.
 */
export function directTransport({ url, keys, openSocket }: { url: string; keys: PairedKeys; openSocket: OpenSocket }): DesktopTransport {
  return {
    kind: "direct",
    open(events) {
      const channel = new EnvelopeChannel(sharedKey(keys.privateKey, keys.desktopPublicKey), keys.deviceId, relayDesktopAddress);
      const socket = openSocket(directSocketUrl(url));
      let reply: string | undefined, welcomed = false;
      return linkOver(socket, events, {
        receive(text, ready) {
          if (!reply) {
            const challenge = readDirectChallenge(text);
            if (!challenge) { socket.close(1002, "Expected a challenge"); return; }
            const auth = directAuth(channel, challenge.challenge);
            reply = auth.reply;
            socket.send(JSON.stringify(auth.envelope));
            return;
          }
          const envelope = readEnvelope(text);
          if (!envelope) return;
          if (!welcomed) {
            // Something answering at this address without the desktop's key isn't the paired computer.
            try { checkDirectWelcome(channel, envelope, reply); } catch { socket.close(1008, "Not the paired computer"); return; }
            welcomed = true;
            ready();
            return;
          }
          let frame: DesktopFrame;
          try { frame = parseDesktopFrame(channel.open(envelope)); } catch { return; }
          events.frame(frame);
        },
        send: (frame) => socket.send(JSON.stringify(channel.seal(frame))),
        // The desktop refuses a phone it doesn't know, and closes a removed phone's sockets, with 4401.
        refusal: (event) => (event.code === directCloseCodes.refused ? removedMessage : undefined),
      });
    },
  };
}

const notEntitled: Record<string, string> = {
  payment_required: "Payment due. Phaseo Connect is off for this computer until its workspace's charge is paid on phaseo.app.",
  connect_off: "Phaseo Connect is off for this computer. Turn it on in Settings → Phone on the computer.",
};

export type RelayCredentials = PairedKeys & { relayUrl: string; desktopId: string; relayToken: string };

/**
 * Phaseo Connect: the same frames, sealed end to end in envelopes the relay can't read, addressed to "desktop" (the
 * relay sets the sender itself). Envelopes are opened in the order they arrive; the channel refuses one that repeats
 * or goes backwards. Messages and answers are marked for the relay to hold while the computer is offline.
 */
export function relayTransport({ credentials, openSocket }: { credentials: RelayCredentials; openSocket: OpenSocket }): DesktopTransport {
  const { relayUrl, desktopId, deviceId, relayToken, privateKey, desktopPublicKey } = credentials;
  return {
    kind: "connect",
    open(events) {
      const channel = new EnvelopeChannel(sharedKey(privateKey, desktopPublicKey), deviceId, relayDesktopAddress);
      const socket = openSocket(relayPhoneUrl(relayUrl, desktopId), relayToken);
      return linkOver(socket, events, {
        // Nothing is said first: the relay link is ready once the socket opens.
        readyOnOpen: true,
        receive(text) {
          const frame = parseRelayFrame(text);
          if (!frame || !("ciphertext" in frame)) return;
          let desktop: DesktopFrame;
          try { desktop = parseDesktopFrame(channel.open(frame)); } catch { return; }
          events.frame(desktop);
        },
        send(frame) {
          const envelope = channel.seal(frame);
          socket.send(JSON.stringify(relayHolds(frame) ? { ...envelope, hold: true } : envelope));
        },
        refusal(event) {
          if (event.code === relayCloseCodes.deviceRemoved) return removedMessage;
          if (event.code === relayCloseCodes.notEntitled) return notEntitled[event.reason ?? ""] ?? notEntitled.payment_required;
          return undefined;
        },
      });
    },
  };
}

/** The real socket: React Native's WebSocket takes headers as its third argument. */
export const openNativeSocket: OpenSocket = (url, token) => {
  const NativeSocket = WebSocket as unknown as new (url: string, protocols: undefined, options: { headers: Record<string, string> }) => SocketLike;
  return new NativeSocket(url, undefined, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
};
