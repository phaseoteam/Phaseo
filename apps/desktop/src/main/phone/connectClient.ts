import WebSocket from "ws";
import { EnvelopeChannel, parseRelayFrame, readFrameObject, relayCloseCodes, relayDesktopAddress, relayDesktopUrl, relayHolds, relayPairingPrefix, sharedKey, type DesktopFrame, type Envelope, type RelayDesktopFrame, type RelayOutbound, type RelayRefusal } from "@phaseo/phone-protocol";
import type { PhoneDeviceRecord, PhonePairing } from "./phoneDevices";
import type { PhoneHub, PhoneSession } from "./phoneSession";

/** Why the relay turned this computer away; each stops reconnecting until the person acts. */
export type ConnectRefusal = "signed-out" | "unauthorized" | "payment-due" | "connect-off" | "wrong-workspace" | "replaced";
export type ConnectClientState = { status: "connecting" | "connected" | "stopped" | "refused"; reason?: ConnectRefusal; message?: string };
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
const refusalMessages: Record<ConnectRefusal, string> = {
	"signed-out": "Sign in to Phaseo in Settings → Accounts to use Phaseo Connect.",
	unauthorized: "Phaseo Connect didn't accept this computer's Phaseo sign-in. Sign in again in Settings → Accounts.",
	"payment-due": "Payment due. Phaseo Connect is off until last month's charge is paid from your credits. Add credits and it turns back on.",
	"connect-off": "Phaseo Connect is off for this workspace.",
	"wrong-workspace": "This computer is linked to Phaseo Connect in another workspace.",
	replaced: "Phaseo Connect was opened by another copy of Phaseo with this computer's identity.",
};
const refused = (reason: ConnectRefusal): ConnectClientState => ({ status: "refused", reason, message: refusalMessages[reason] });
/** The relay's sign-in refusals that retrying won't fix. Anything else (a 503, a network error) is retried. */
const refusalFor = (status: number, error: RelayRefusal | undefined): ConnectRefusal | undefined =>
	status === 401 ? "unauthorized" : status === 402 ? "payment-due" : error === "connect_off" ? "connect-off" : error === "workspace_mismatch" ? "wrong-workspace" : status === 403 ? "unauthorized" : undefined;
const closeRefusal = (code: number, reason: string): ConnectRefusal | undefined =>
	code === relayCloseCodes.notEntitled ? (reason === "connect_off" ? "connect-off" : "payment-due") : code === relayCloseCodes.replaced ? "replaced" : undefined;

/**
 * Phaseo Connect from the desktop: one outbound WebSocket to the relay, signed in with the Phaseo gateway key. Phones'
 * frames arrive in envelopes only they and this desktop can open; each phone gets a PhoneSession as on the direct
 * server, so everything it does goes through the same commands. Attention is sent marked hold, and the relay keeps it
 * for a phone that isn't connected until it returns.
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
		for (const device of this.ports.devices()) if (!connected.has(device.id)) this.sendTo(device, { type: "attention", ...event } as DesktopFrame);
	}

	private setState(state: ConnectClientState) { this.state = state; this.ports.onState?.(state); }
	private write(frame: RelayDesktopFrame | RelayOutbound) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(frame)); }

	private async open() {
		if (this.stopped) return;
		this.setState({ status: "connecting" });
		let key: string;
		try { key = await this.ports.gatewayKey(); }
		catch { this.stopped = true; this.setState(refused("signed-out")); return; }
		if (this.stopped) return;
		const socket = new WebSocket(relayDesktopUrl(this.ports.relayUrl, this.ports.desktopId), { headers: { Authorization: `Bearer ${key}` }, maxPayload: 4 * 1024 * 1024, handshakeTimeout: 15_000 });
		this.socket = socket;
		let openedAt = 0, refusal: ConnectRefusal | undefined;
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
			if ("ciphertext" in frame) { this.receive(frame); return; }
			if ("type" in frame && frame.type === "device_offline") this.sessions.get(frame.deviceId)?.close();
		});
		// A refused sign-in: the status says most, and the body's { error } tells a switched-off workspace from another workspace's room.
		socket.on("unexpected-response", (_request, response) => {
			const chunks: Buffer[] = [];
			const decide = () => {
				let error: RelayRefusal | undefined;
				try { error = (JSON.parse(Buffer.concat(chunks).toString("utf8").slice(0, 1024)) as { error?: RelayRefusal }).error; } catch { /* no body */ }
				refusal = refusalFor(response.statusCode ?? 0, error);
				socket.terminate();
			};
			response.on("data", (chunk: Buffer) => { if (chunks.length < 4) chunks.push(chunk); });
			response.on("end", decide);
			response.on("error", decide);
		});
		socket.on("error", () => { /* close follows */ });
		socket.on("close", (code, reason) => {
			if (this.socket === socket) this.socket = undefined;
			this.closeSessions();
			if (this.stopped) return;
			refusal ??= closeRefusal(code, reason.toString());
			if (refusal) { this.stopped = true; this.setState(refused(refusal)); return; }
			if (openedAt && Date.now() - openedAt >= stableMs) this.attempt = 0;
			const wait = (this.ports.backoff ?? defaultBackoff)(this.attempt++);
			this.setState({ status: "connecting" });
			this.retry = setTimeout(() => void this.open(), wait); this.retry.unref?.();
		});
	}
	private closeSessions() { for (const session of [...this.sessions.values()]) session.close(); this.sessions.clear(); this.channels.clear(); }

	/** The relay names this side "desktop" in every route and sets `from` itself, so channels seal with that name. */
	private channel(device: { id: string; publicKey: string }) {
		let channel = this.channels.get(device.id);
		if (!channel) { channel = new EnvelopeChannel(sharedKey(this.ports.privateKey, device.publicKey), relayDesktopAddress, device.id); this.channels.set(device.id, channel); }
		return channel;
	}
	private sendTo(device: { id: string; publicKey: string }, frame: DesktopFrame | Record<string, unknown>) {
		const envelope = this.channel(device).seal(frame);
		this.write(relayHolds(frame) ? { ...envelope, hold: true } : envelope);
	}

	private receive(envelope: Envelope) {
		if (envelope.to !== relayDesktopAddress) return;
		if (envelope.from.startsWith(relayPairingPrefix)) { this.pair(envelope); return; }
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
		try { request = readFrameObject(new EnvelopeChannel(sharedKey(this.ports.privateKey, publicKey), relayDesktopAddress, envelope.from).open(envelope)); } catch { return; }
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
