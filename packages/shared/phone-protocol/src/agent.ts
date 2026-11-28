import { EnvelopeChannel, generateKeyPair, relayPairing, sharedKey } from "./envelope";
import { decodePairingLink, validatePairResult } from "./pairing";
import { parseRelayFrame, relayDesktopAddress, relayPhoneUrl } from "./relay";
import type { RemoteAgentAccess } from "./agentTools";

export * from "./agentTools";

/**
 * Remote agents: an MCP client that isn't on the computer, through mcp.phaseo.app, driving the
 * desktop's chats over Phaseo Connect. It pairs like a phone, with a pairing link the person makes in the desktop's
 * Settings → Outside agents (the link names what it may do), and then speaks only the frames below. The desktop gives
 * it the same tools, and the same limits, as an outside agent on the computer with a token of that access.
 *
 * - `{ id, type: "agent_hello" }` answers { desktopName, access, tools }.
 * - `{ id, type: "agent_tool", name, arguments }` runs one tool and answers { result }.
 * - `{ id, type: "agent_unlink" }` removes the link on the desktop, as Remove there does.
 *
 * Each answer echoes the id and type with `ok: true` and a result, or `ok: false` and { error: { message } }.
 */
export type RemoteAgentRequest =
	| { id: string; type: "agent_hello" }
	| { id: string; type: "agent_tool"; name: string; arguments: Record<string, unknown> }
	| { id: string; type: "agent_unlink" };
export type RemoteAgentHello = { desktopName: string; access: RemoteAgentAccess; tools: string[] };
export type RemoteAgentReply =
	| { id: string; type: RemoteAgentRequest["type"]; ok: true; result: unknown }
	| { id: string; type: RemoteAgentRequest["type"]; ok: false; error: { message: string } };

const plain = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** A remote agent's request as the desktop accepts it. Throws with a message the agent can read. */
export function parseRemoteAgentRequest(text: string): RemoteAgentRequest {
	let value: unknown;
	try { value = JSON.parse(text); } catch { throw new Error("The request was not JSON."); }
	if (!plain(value) || typeof value.id !== "string" || !value.id || value.id.length > 64) throw new Error("The request has no id.");
	const id = value.id;
	if (value.type === "agent_hello" || value.type === "agent_unlink") return { id, type: value.type };
	if (value.type === "agent_tool") {
		if (typeof value.name !== "string" || !/^[a-z_]{1,64}$/.test(value.name)) throw new Error("Name a tool.");
		if (value.arguments !== undefined && !plain(value.arguments)) throw new Error("A tool's arguments are an object.");
		return { id, type: "agent_tool", name: value.name, arguments: (value.arguments as Record<string, unknown> | undefined) ?? {} };
	}
	throw new Error("Unknown request.");
}

/** What the remote side keeps of a link. The private key and relay token are secrets; only it and the desktop hold them. */
export type RemoteAgentLinkState = {
	v: 1; relayUrl: string; desktopId: string; desktopName: string; desktopPublicKey: string;
	deviceId: string; relayToken: string; privateKey: string; linkedAt: string;
};
/** A WebSocket as the link needs one, so a Worker (fetch upgrade) and Node (ws) can both supply it. */
export type RemoteAgentSocket = { send(text: string): void; close(code?: number, reason?: string): void };
export type RemoteAgentSocketEvents = { message(text: string): void; close(code: number, reason: string): void };
/** Opens a socket to `url` with `Authorization: Bearer <token>`; rejects when it can't. */
export type RemoteAgentConnector = (url: string, token: string, events: RemoteAgentSocketEvents) => Promise<RemoteAgentSocket>;

export class RemoteAgentError extends Error {
	constructor(readonly code: "offline" | "timeout" | "refused" | "closed" | "rejected" | "invalid", message: string) { super(message); }
}

const offlineMessage = (desktopName: string) => `${desktopName} isn't connected to Phaseo Connect right now. Open Phaseo Desktop there, with phone access and Phaseo Connect on.`;

/**
 * One connection to the relay as the linked device. Requests wait for the desktop's answer with the same id; the
 * socket closes after `idleMs` with nothing pending. The relay allows one socket per device, so callers keep one
 * session per link (a Durable Object, in mcp.phaseo.app).
 */
export class RemoteAgentSession {
	private socket?: Promise<RemoteAgentSocket>;
	private channel?: EnvelopeChannel;
	private online?: boolean;
	/** Why the relay closed the last socket, so a sign-in it refused isn't reported as an offline desktop. */
	private closedWith?: RemoteAgentError;
	private onlineWaiters: ((online: boolean) => void)[] = [];
	private readonly pending = new Map<string, { resolve: (reply: RemoteAgentReply) => void; reject: (error: Error) => void }>();
	private idle?: ReturnType<typeof setTimeout>;
	private next = 0;
	constructor(private readonly state: RemoteAgentLinkState, private readonly connect: RemoteAgentConnector, private readonly options: { idleMs?: number; onlineWaitMs?: number } = {}) {}

	/** Sends one request and waits for its answer, up to timeoutMs. An `ok: false` answer is thrown as `rejected`. */
	async request(frame: { type: "agent_hello" } | { type: "agent_unlink" } | { type: "agent_tool"; name: string; arguments: Record<string, unknown> }, timeoutMs: number): Promise<unknown> {
		clearTimeout(this.idle);
		try {
			await this.open();
			if (!await this.desktopOnline()) throw this.closedWith ?? new RemoteAgentError("offline", offlineMessage(this.state.desktopName));
			const id = `r${Date.now().toString(36)}${(this.next++).toString(36)}`;
			const reply = await new Promise<RemoteAgentReply>((resolve, reject) => {
				const timer = setTimeout(() => { this.pending.delete(id); reject(new RemoteAgentError("timeout", `${this.state.desktopName} didn't answer within ${Math.round(timeoutMs / 1000)} seconds.`)); }, timeoutMs);
				this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
				void this.socket!.then(socket => socket.send(JSON.stringify(this.channel!.seal({ id, ...frame }))), error => this.pending.get(id)?.reject(error as Error));
			});
			if (reply.ok === false) throw new RemoteAgentError("rejected", reply.error.message);
			return reply.result;
		} finally {
			if (!this.pending.size) { clearTimeout(this.idle); this.idle = setTimeout(() => this.close(), this.options.idleMs ?? 60_000); (this.idle as { unref?: () => void }).unref?.(); }
		}
	}
	close() {
		clearTimeout(this.idle);
		const socket = this.socket; this.socket = undefined; this.channel = undefined; this.online = undefined;
		void socket?.then(value => value.close(1000), () => {});
		this.fail(new RemoteAgentError("closed", "The connection to the desktop closed."));
	}

	private fail(error: Error) {
		for (const entry of [...this.pending.values()]) entry.reject(error);
		this.pending.clear();
		for (const waiter of this.onlineWaiters.splice(0)) waiter(false);
	}
	private setOnline(online: boolean) { this.online = online; for (const waiter of this.onlineWaiters.splice(0)) waiter(online); if (!online) this.fail(new RemoteAgentError("offline", offlineMessage(this.state.desktopName))); }
	/** The relay says whether the desktop is there as soon as the socket opens. */
	private desktopOnline() {
		if (this.online !== undefined) return Promise.resolve(this.online);
		return new Promise<boolean>(resolve => {
			const timer = setTimeout(() => { this.onlineWaiters = this.onlineWaiters.filter(entry => entry !== done); resolve(false); }, this.options.onlineWaitMs ?? 5_000);
			const done = (online: boolean) => { clearTimeout(timer); resolve(online); };
			this.onlineWaiters.push(done);
		});
	}
	private open() {
		if (this.socket) return this.socket;
		this.closedWith = undefined;
		const channel = this.channel = new EnvelopeChannel(sharedKey(this.state.privateKey, this.state.desktopPublicKey), this.state.deviceId, relayDesktopAddress);
		const opening = this.socket = this.connect(relayPhoneUrl(this.state.relayUrl, this.state.desktopId), this.state.relayToken, {
			message: text => {
				if (this.socket !== opening) return;
				const frame = parseRelayFrame(text);
				if (!frame) return;
				if ("ciphertext" in frame) {
					let reply: RemoteAgentReply;
					try { reply = JSON.parse(channel.open(frame)) as RemoteAgentReply; } catch { return; }
					this.pending.get(reply.id)?.resolve(reply); this.pending.delete(reply.id);
					return;
				}
				if ("type" in frame && (frame.type === "desktop_online" || frame.type === "desktop_offline")) this.setOnline(frame.type === "desktop_online");
			},
			close: (code, reason) => {
				if (this.socket !== opening) return;
				this.socket = undefined; this.channel = undefined; this.online = undefined;
				// 4001: the desktop removed this link (or never had it).
				this.fail(this.closedWith = code === 4001 ? new RemoteAgentError("refused", "Phaseo Desktop removed this link. Make a new link in Settings → Outside agents there.")
					: code === 4402 ? new RemoteAgentError("refused", "Phaseo Connect is off for this workspace, or a month is unpaid.")
					: new RemoteAgentError("closed", `The connection to the desktop closed${reason ? ` (${reason})` : ""}.`));
			},
		});
		opening.catch(() => { if (this.socket === opening) { this.socket = undefined; this.channel = undefined; } });
		return opening;
	}
}

/**
 * Links to a desktop with the pairing link the person made there: signs in to the relay with the code's pairing token,
 * sends a sealed pair request with a fresh key, and returns what to keep. `relayUrl` is the only relay it will use, so a
 * link can't send the remote side somewhere else.
 */
export async function linkRemoteAgent(link: string, options: { relayUrl: string; deviceName: string; connect: RemoteAgentConnector; timeoutMs?: number; now?: () => Date }): Promise<RemoteAgentLinkState> {
	let payload;
	try { payload = decodePairingLink(link.trim()); } catch (error) { throw new RemoteAgentError("invalid", error instanceof Error ? error.message : "This link is damaged."); }
	if (!payload.connect) throw new RemoteAgentError("invalid", "This link can't be used from here: it was made without Phaseo Connect. Turn on Phaseo Connect in Settings → Phone on the desktop, then make a new link.");
	const trim = (url: string) => { let end = url.length; while (end > 0 && url[end - 1] === "/") end--; return url.slice(0, end); };
	if (trim(payload.connect.relayUrl) !== trim(options.relayUrl)) throw new RemoteAgentError("invalid", "This link names a different Phaseo Connect relay.");
	const keys = generateKeyPair(), signIn = relayPairing(payload.pairingCode);
	const channel = new EnvelopeChannel(sharedKey(keys.privateKey, payload.desktopPublicKey), signIn.deviceId, relayDesktopAddress);
	const timeoutMs = options.timeoutMs ?? 20_000;
	let socket: RemoteAgentSocket | undefined;
	try {
		const answer = await new Promise<Record<string, unknown>>((resolve, reject) => {
			let done = false;
			const timer = setTimeout(() => { done = true; reject(new RemoteAgentError("timeout", "The desktop didn't answer. Check it's open with Phaseo Connect on, then try again.")); }, timeoutMs);
			const finish = (action: () => void) => { done = true; clearTimeout(timer); action(); };
			// The relay can say the desktop is online before the connector hands back the socket, so pair once both are there.
			let online = false, sent = false;
			const pair = () => {
				// Never send the one-time code after the caller was told the link failed.
				if (sent || done || !online || !socket) return;
				sent = true;
				socket.send(JSON.stringify({ ...channel.seal({ id: "pair", type: "pair", pairingCode: payload.pairingCode, deviceName: options.deviceName, devicePublicKey: keys.publicKey }), senderPublicKey: keys.publicKey }));
			};
			options.connect(relayPhoneUrl(payload.connect!.relayUrl, payload.connect!.desktopId), signIn.relayToken, {
				message: text => {
					const frame = parseRelayFrame(text);
					if (!frame) return;
					if ("ciphertext" in frame) {
						// Only an answer that opens settles the pairing; anything else leaves the timeout running.
						let answer: Record<string, unknown>;
						try { answer = JSON.parse(channel.open(frame)) as Record<string, unknown>; } catch { return; }
						finish(() => resolve(answer));
						return;
					}
					if ("type" in frame && frame.type === "desktop_offline") finish(() => reject(new RemoteAgentError("offline", offlineMessage(payload.desktopName))));
					if ("type" in frame && frame.type === "desktop_online") { online = true; pair(); }
				},
				// The desktop ends the pairing sign-in after answering; a close before then means the code wasn't accepted.
				close: () => finish(() => reject(new RemoteAgentError("refused", "This link has expired or was already used. Make a new one on the desktop."))),
			}).then(value => { socket = value; if (done) value.close(1000); else pair(); }, error => finish(() => reject(new RemoteAgentError("closed", error instanceof Error ? error.message : "Couldn't reach Phaseo Connect."))));
		});
		if (answer.ok !== true) throw new RemoteAgentError("refused", plain(answer.error) && typeof answer.error.message === "string" ? answer.error.message : "The desktop refused the link.");
		const result = validatePairResult(answer.result);
		return { v: 1, relayUrl: payload.connect.relayUrl, desktopId: result.desktopId, desktopName: result.desktopName, desktopPublicKey: payload.desktopPublicKey, deviceId: result.deviceId, relayToken: result.relayToken, privateKey: keys.privateKey, linkedAt: (options.now?.() ?? new Date()).toISOString() };
	} finally { socket?.close(1000); }
}

/** A stored link, or undefined when it's from another version or damaged. */
export function readRemoteAgentLinkState(value: unknown): RemoteAgentLinkState | undefined {
	if (!plain(value) || value.v !== 1) return undefined;
	const keys = ["relayUrl", "desktopId", "desktopName", "desktopPublicKey", "deviceId", "relayToken", "privateKey", "linkedAt"] as const;
	return keys.every(key => typeof value[key] === "string" && (value[key] as string).length > 0 && (value[key] as string).length <= 500) ? value as RemoteAgentLinkState : undefined;
}
