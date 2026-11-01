import WebSocket from "ws";
import { EnvelopeChannel, parseRelayFrame, readFrameObject, relayDesktopUrl, sharedKey, type DesktopFrame, type Envelope, type RelayDesktopFrame, type RelayOutbound } from "@phaseo/phone-protocol";
import type { PhoneDeviceRecord, PhonePairing } from "./phoneDevices";
import type { PhoneHub, PhoneSession } from "./phoneSession";

export type ConnectClientState = { status: "connecting" | "connected" | "stopped" | "refused"; message?: string };
export type ConnectClientPorts = {
	relayUrl: string;
	desktopId: string;
	desktopName: () => string;
	/** The desktop's X25519 private key, base64url. */
	privateKey: string;
	/** The signed-in Phaseo gateway key the relay checks. */
	gatewayKey: () => Promise<string>;
	devices: () => PhoneDeviceRecord[];
	pairing: PhonePairing;
	hub: PhoneHub;
	onState?: (state: ConnectClientState) => void;
	/** Backoff before reconnect attempt n (from 0); jitter keeps many desktops from returning at once. */
	backoff?: (attempt: number) => number;
};

const defaultBackoff = (attempt: number) => Math.min(60_000, 1_000 * 2 ** attempt) * (0.5 + Math.random() / 2);
/** A connection that lasts this long resets the backoff, so a relay that drops us at once isn't retried every second. */
const stableMs = 30_000;
const refusedMessages: Record<string, string> = {
	unauthorized: "Phaseo Connect didn't accept this computer's Phaseo sign-in. Sign in again in Settings → Accounts.",
	not_entitled: "Phaseo Connect is off for this workspace.",
	unpaid: "Phaseo Connect is paused until last month's charge is paid. Add credits to turn it back on.",
	wrong_workspace: "This computer is linked to Phaseo Connect in another workspace.",
};

/**
 * Phaseo Connect from the desktop: one outbound WebSocket to the relay, signed in with the Phaseo gateway key. Phones'
 * frames arrive in envelopes only they and this desktop can open; each phone gets a PhoneSession as on the direct
 * server, so everything it does goes through the same commands. Attention for a phone that isn't connected is sent
 * marked hold, and the relay keeps it until the phone returns.
 */
export class ConnectClient {
	private socket?: WebSocket;
	private stopped = true;
	private attempt = 0;
	private retry?: ReturnType<typeof setTimeout>;
	private readonly channels = new Map<string, EnvelopeChannel>();
	private readonly sessions = new Map<string, PhoneSession>();
	state: ConnectClientState = { status: "stopped" };
	constructor(private readonly ports: ConnectClientPorts) {}

	start() {
		if (!this.stopped) return;
		this.stopped = false; this.attempt = 0;
		void this.open();
	}
	stop() {
		this.stopped = true; clearTimeout(this.retry);
		this.closeSessions();
		const socket = this.socket; this.socket = undefined;
		socket?.close(1000);
		this.setState({ status: "stopped" });
	}

	/** Lets a phone sign in to the relay; sent again on every reconnect. */
	registerDevice(deviceId: string, relayTokenHash: string) { this.write({ type: "register_device", deviceId, relayTokenHash }); }
	removeDevice(deviceId: string) {
		this.write({ type: "remove_device", deviceId });
		this.channels.delete(deviceId); this.sessions.get(deviceId)?.close();
	}
	/** Attention for paired phones without a live connection; the relay holds it for them. */
	notifyOffline(event: { chatId: string; kind: string; summary: string }, connected: ReadonlySet<string>) {
		for (const device of this.ports.devices()) if (!connected.has(device.id)) this.sendTo(device, { type: "attention", ...event } as DesktopFrame, true);
	}

	private setState(state: ConnectClientState) { this.state = state; this.ports.onState?.(state); }
	private write(frame: RelayDesktopFrame | RelayOutbound) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(frame)); }

	private async open() {
		if (this.stopped) return;
		this.setState({ status: "connecting" });
		let key: string;
		try { key = await this.ports.gatewayKey(); }
		catch { this.setState({ status: "refused", message: "Sign in to Phaseo in Settings → Accounts to use Phaseo Connect." }); this.stopped = true; return; }
		if (this.stopped) return;
		const socket = new WebSocket(relayDesktopUrl(this.ports.relayUrl, this.ports.desktopId), { headers: { Authorization: `Bearer ${key}` }, maxPayload: 4 * 1024 * 1024, handshakeTimeout: 15_000 });
		this.socket = socket;
		let openedAt = 0, refused: string | undefined;
		socket.on("open", () => {
			openedAt = Date.now();
			for (const device of this.ports.devices()) this.registerDevice(device.id, device.relayTokenHash);
			for (const code of this.ports.pairing.relayCodes()) this.registerDevice(code.deviceId, code.relayTokenHash);
			this.setState({ status: "connected" });
		});
		socket.on("message", (data, binary) => {
			if (binary) return;
			const frame = parseRelayFrame(data.toString());
			if (!frame) return;
			if ("type" in frame && frame.type === "error") {
				if (refusedMessages[frame.code]) { refused = refusedMessages[frame.code]; socket.close(1000); }
				return;
			}
			if ("type" in frame && frame.type === "device_offline") { this.sessions.get(frame.deviceId)?.close(); return; }
			if ("ciphertext" in frame) this.receive(frame);
		});
		socket.on("unexpected-response", (_request, response) => { refused = response.statusCode === 401 || response.statusCode === 403 ? refusedMessages.unauthorized : response.statusCode === 402 ? refusedMessages.unpaid : undefined; socket.terminate(); });
		socket.on("error", () => { /* close follows */ });
		socket.on("close", () => {
			if (this.socket === socket) this.socket = undefined;
			this.closeSessions();
			if (this.stopped) return;
			if (refused) { this.stopped = true; this.setState({ status: "refused", message: refused }); return; }
			if (openedAt && Date.now() - openedAt >= stableMs) this.attempt = 0;
			const wait = (this.ports.backoff ?? defaultBackoff)(this.attempt++);
			this.setState({ status: "connecting" });
			this.retry = setTimeout(() => void this.open(), wait); this.retry.unref?.();
		});
	}
	private closeSessions() { for (const session of [...this.sessions.values()]) session.close(); this.sessions.clear(); this.channels.clear(); }

	private channel(device: { id: string; publicKey: string }) {
		let channel = this.channels.get(device.id);
		if (!channel) { channel = new EnvelopeChannel(sharedKey(this.ports.privateKey, device.publicKey), this.ports.desktopId, device.id); this.channels.set(device.id, channel); }
		return channel;
	}
	private sendTo(device: { id: string; publicKey: string }, frame: DesktopFrame | Record<string, unknown>, hold = false) {
		const envelope = this.channel(device).seal(frame);
		this.write(hold ? { ...envelope, hold: true } : envelope);
	}

	private receive(envelope: Envelope) {
		if (envelope.to !== this.ports.desktopId) return;
		if (envelope.from.startsWith("pair-")) { this.pair(envelope); return; }
		const device = this.ports.devices().find(value => value.id === envelope.from);
		if (!device) return;
		let text: string;
		try { text = this.channel(device).open(envelope); } catch { return; }
		this.ports.pairing.seen(device.id);
		let session = this.sessions.get(device.id);
		if (!session || session.isClosed) {
			const opened = this.ports.hub.open({ id: device.id, name: device.name }, frame => this.sendTo(device, frame));
			this.sessions.set(device.id, opened);
			opened.whenClosed(() => { if (this.sessions.get(device.id) === opened) this.sessions.delete(device.id); });
			session = opened;
		}
		void session.receive(text);
	}

	/** A pair frame over the relay: the phone isn't paired yet, so its key travels beside the envelope. */
	private pair(envelope: Envelope) {
		const publicKey = envelope.senderPublicKey;
		if (!publicKey || !this.ports.pairing.hasRelayCode(envelope.from)) return;
		const peer = { id: envelope.from, publicKey };
		let request: Record<string, unknown>;
		try { request = readFrameObject(new EnvelopeChannel(sharedKey(this.ports.privateKey, publicKey), this.ports.desktopId, envelope.from).open(envelope)); } catch { return; }
		const id = typeof request.id === "string" ? request.id.slice(0, 64) : "pair";
		try {
			if (request.type !== "pair" || request.devicePublicKey !== publicKey) throw new Error("Invalid pairing request.");
			const { device, result } = this.ports.pairing.redeem(request);
			this.sendTo(peer, { id, type: "pair", ok: true, result: { ...result, desktopName: this.ports.desktopName() } });
			this.registerDevice(device.id, device.relayTokenHash);
		} catch (error) {
			this.sendTo(peer, { id, type: "pair", ok: false, error: { code: "rejected", message: error instanceof Error ? error.message : "Pairing failed." } });
		}
		this.channels.delete(peer.id);
	}
}
