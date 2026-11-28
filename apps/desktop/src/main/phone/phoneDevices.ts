import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pairingLifetimeMs, phoneCapabilities, relayPairing, tokenHash, validatePairRequest, type PairResult, type PhoneCapability } from "@phaseo/phone-protocol";
import type { OutsideAgentAccess } from "../../shared/outsideAgents";
import { defaultPhonePort, phoneAccessDefaults, type PhoneAccess, type PhoneAddressKind } from "../../shared/phone";

export type PhoneDeviceRecord = { id: string; name: string; publicKey: string; relayTokenHash: string; pairedAt: string; lastSeenAt?: string; access: PhoneAccess };
/**
 * An AI app linked over Phaseo Connect through mcp.phaseo.app. It pairs like a phone but is kept apart from
 * the phones, so nothing a phone may do (sessions, the direct server, attention) ever reaches it; it gets only the
 * outside-agent tools of its access (remoteAgents.ts).
 */
export type AgentDeviceRecord = { id: string; name: string; publicKey: string; relayTokenHash: string; pairedAt: string; lastSeenAt?: string; access: OutsideAgentAccess;
	/** The last envelope sequence accepted from it, kept across reconnects and restarts so a replayed request is refused. */
	lastSeq?: number };
/** A stored switch that isn't a boolean takes its default, so a phone paired before switches existed can read code and nothing more. */
const readAccess = (value: unknown): PhoneAccess => {
	const stored = value && typeof value === "object" ? value as Partial<Record<keyof PhoneAccess, unknown>> : {};
	return { code: typeof stored.code === "boolean" ? stored.code : phoneAccessDefaults.code, changes: stored.changes === true, terminal: stored.terminal === true };
};
/** The capabilities a phone is told it has, in the protocol's order. */
export const capabilitiesOf = (access: PhoneAccess): PhoneCapability[] => phoneCapabilities.filter(capability => access[capability]);
/** Settings → Remote access as kept on disk. Tokens are kept only as hashes; the identity key is in the credential vault. */
export type PhoneSettings = { enabled: boolean; port: number; addresses: Record<PhoneAddressKind, boolean>; desktopId: string; tailscaleServe: boolean; connect: boolean; devices: PhoneDeviceRecord[];
	/** Apps linked over Phaseo Connect (Settings → Outside agents), kept apart from the phones. */
	agents?: AgentDeviceRecord[];
	/** Phones and pairing codes removed while the relay couldn't be told, sent again until it confirms (see ConnectClient). */
	relayRemovals?: string[];
};
const defaults = (): PhoneSettings => ({ enabled: false, port: defaultPhonePort, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": true }, desktopId: randomUUID(), tailscaleServe: false, connect: false, devices: [], agents: [], relayRemovals: [] });
const text = (value: unknown, max = 200): value is string => typeof value === "string" && value.length > 0 && value.length <= max;

/** phone.json in the workspace folder, written whole on each change. A damaged file starts over: off, with no phones. */
export class PhoneSettingsFile {
	private readonly file: string;
	value: PhoneSettings;
	constructor(directory: string) {
		this.file = path.join(directory, "phone.json");
		const fallback = defaults();
		try {
			const stored = existsSync(this.file) ? JSON.parse(readFileSync(this.file, "utf8")) as Partial<PhoneSettings> : {};
			const addresses = stored.addresses && typeof stored.addresses === "object" ? stored.addresses : fallback.addresses;
			this.value = {
				enabled: stored.enabled === true, port: Number.isInteger(stored.port) && stored.port! >= 1024 && stored.port! <= 65535 ? stored.port! : fallback.port,
				addresses: { lan: addresses.lan === true, "tailscale-ip": addresses["tailscale-ip"] !== false, "tailscale-https": addresses["tailscale-https"] !== false },
				desktopId: text(stored.desktopId, 100) ? stored.desktopId : fallback.desktopId, tailscaleServe: stored.tailscaleServe === true, connect: stored.connect === true,
				devices: (Array.isArray(stored.devices) ? stored.devices : []).filter(device => device && text(device.id) && text(device.name) && text(device.publicKey) && text(device.relayTokenHash) && text(device.pairedAt)).map(device => ({ ...device, access: readAccess(device.access) })),
				agents: (Array.isArray(stored.agents) ? stored.agents : []).filter(agent => agent && text(agent.id) && text(agent.name) && text(agent.publicKey) && text(agent.relayTokenHash) && text(agent.pairedAt) && (agent.access === "read" || agent.access === "start")),
				relayRemovals: (Array.isArray(stored.relayRemovals) ? stored.relayRemovals : []).filter(id => text(id, 100)).slice(-100),
			};
		} catch { this.value = fallback; }
	}
	save(change: Partial<PhoneSettings> = {}) {
		this.value = { ...this.value, ...change };
		writeFileSync(`${this.file}.tmp`, JSON.stringify(this.value, null, "\t"), { mode: 0o600 });
		renameSync(`${this.file}.tmp`, this.file);
		return this.value;
	}
}

export type DeviceStore = { value: PhoneSettings; save: (change?: Partial<PhoneSettings>) => PhoneSettings };
const sha = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Pairing codes and the phones they made. A code is 32 random bytes, works once, and lasts ten minutes; only its hash is
 * kept. A paired phone signs in directly by proving the key it paired with, and to Phaseo Connect's relay with a relay
 * token kept only as a hash; removing the phone revokes both at once.
 */
export class PhonePairing {
	private readonly codes = new Map<string, { expiresAt: number; relayDeviceId: string; relayTokenHash: string; agent?: OutsideAgentAccess }>();
	onPaired?: (device: PhoneDeviceRecord | AgentDeviceRecord) => void;
	onRemoved?: (deviceId: string) => void;
	onAccessChanged?: (deviceId: string) => void;
	onCodeExpired?: (relayDeviceId: string) => void;
	constructor(private readonly store: DeviceStore, private readonly now: () => number = Date.now) {}

	/** A code for a phone, or with `agent` for an app linked over Phaseo Connect with that access. */
	create(options: { agent?: OutsideAgentAccess } = {}) {
		this.prune();
		// A few at once covers a person who reopens the dialog; older ones stay valid until they expire.
		if (this.codes.size >= 5) { const oldest = [...this.codes.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]!; this.codes.delete(oldest[0]); this.onCodeExpired?.(oldest[1].relayDeviceId); }
		const pairingCode = randomBytes(32).toString("base64url"), expiresAt = this.now() + pairingLifetimeMs, relay = relayPairing(pairingCode);
		this.codes.set(sha(pairingCode), { expiresAt, relayDeviceId: relay.deviceId, relayTokenHash: tokenHash(relay.relayToken), ...options.agent ? { agent: options.agent } : {} });
		return { pairingCode, expiresAt: new Date(expiresAt).toISOString(), relay };
	}
	private prune() {
		for (const [hash, code] of this.codes) if (code.expiresAt <= this.now()) { this.codes.delete(hash); this.onCodeExpired?.(code.relayDeviceId); }
	}
	/** Pairs a phone with a code, once. Throws the same message for an unknown, used or expired code. */
	redeem(value: unknown, options: { overRelay?: boolean } = {}): { device: PhoneDeviceRecord | AgentDeviceRecord; agent: boolean; result: Omit<PairResult, "desktopName"> } {
		const request = validatePairRequest(value);
		this.prune();
		const hash = sha(request.pairingCode), code = this.codes.get(hash);
		if (!code) throw new Error("This pairing code has expired or was already used. Show a new one on the computer.");
		// An app's link is for Phaseo Connect only; the phone server never takes one, and leaves it for the app.
		if (code.agent && !options.overRelay) throw new Error("This pairing code has expired or was already used. Show a new one on the computer.");
		this.codes.delete(hash);
		if (code.agent) return this.redeemAgent(request, code.agent, code.relayDeviceId);
		if (this.store.value.devices.length >= 20) throw new Error("Remove a phone before pairing another; up to 20 are kept.");
		const relayToken = randomBytes(32).toString("base64url");
		const device: PhoneDeviceRecord = { id: randomUUID(), name: request.deviceName, publicKey: request.devicePublicKey, relayTokenHash: tokenHash(relayToken), pairedAt: new Date(this.now()).toISOString(), access: { ...phoneAccessDefaults } };
		this.store.save({ devices: [...this.store.value.devices, device] });
		// After the caller has answered the phone: over Phaseo Connect, ending the pairing sign-in closes its socket.
		queueMicrotask(() => this.onCodeExpired?.(code.relayDeviceId));
		this.onPaired?.(device);
		return { device, agent: false, result: { deviceId: device.id, relayToken, desktopId: this.store.value.desktopId } };
	}
	private redeemAgent(request: { deviceName: string; devicePublicKey: string }, access: OutsideAgentAccess, relayDeviceId: string) {
		if (this.agents().length >= 20) throw new Error("Remove a linked app before linking another; up to 20 are kept.");
		const relayToken = randomBytes(32).toString("base64url");
		const agent: AgentDeviceRecord = { id: randomUUID(), name: request.deviceName, publicKey: request.devicePublicKey, relayTokenHash: tokenHash(relayToken), pairedAt: new Date(this.now()).toISOString(), access };
		this.store.save({ agents: [...this.agents(), agent] });
		queueMicrotask(() => this.onCodeExpired?.(relayDeviceId));
		this.onPaired?.(agent);
		return { device: agent, agent: true, result: { deviceId: agent.id, relayToken, desktopId: this.store.value.desktopId } };
	}
	/** Apps linked over Phaseo Connect. */
	agents() { return this.store.value.agents ?? []; }
	agent(agentId: string) { return this.agents().find(agent => agent.id === agentId); }
	/** Accepts an app's envelope once: false for a sequence at or below the last one accepted, which is then saved before the request runs. */
	acceptAgentSeq(agentId: string, seq: number) {
		const agent = this.agent(agentId);
		if (!agent || (agent.lastSeq !== undefined && seq <= agent.lastSeq)) return false;
		this.store.save({ agents: this.agents().map(value => value.id === agentId ? { ...value, lastSeq: seq } : value) });
		return true;
	}
	removeAgent(agentId: string) {
		if (!this.agent(agentId)) throw new Error("That app is no longer linked.");
		this.store.save({ agents: this.agents().filter(agent => agent.id !== agentId) });
		this.onRemoved?.(agentId);
	}
	device(deviceId: string) { return this.store.value.devices.find(device => device.id === deviceId); }
	/** Pending codes' relay sign-ins, for Phaseo Connect to register. */
	relayCodes() { this.prune(); return [...this.codes.values()].map(code => ({ deviceId: code.relayDeviceId, relayTokenHash: code.relayTokenHash })); }
	hasRelayCode(relayDeviceId: string) { this.prune(); return [...this.codes.values()].some(code => code.relayDeviceId === relayDeviceId); }
	/** Last seen is kept to the minute, so a busy phone doesn't rewrite the file on every frame. */
	seen(deviceId: string) {
		const device = this.store.value.devices.find(value => value.id === deviceId) ?? this.agent(deviceId);
		if (!device || (device.lastSeenAt && this.now() - Date.parse(device.lastSeenAt) < 60_000)) return;
		const lastSeenAt = new Date(this.now()).toISOString();
		if (this.agent(deviceId)) this.store.save({ agents: this.agents().map(value => value.id === deviceId ? { ...value, lastSeenAt } : value) });
		else this.store.save({ devices: this.store.value.devices.map(value => value.id === deviceId ? { ...value, lastSeenAt } : value) });
	}
	/** Switches some of a phone's capabilities; its connections hear the new list at once. */
	setAccess(deviceId: string, change: Partial<PhoneAccess>) {
		if (!this.store.value.devices.some(device => device.id === deviceId)) throw new Error("That phone is no longer paired.");
		this.store.save({ devices: this.store.value.devices.map(device => device.id === deviceId ? { ...device, access: { ...device.access, ...change } } : device) });
		this.onAccessChanged?.(deviceId);
	}
	remove(deviceId: string) {
		if (!this.store.value.devices.some(device => device.id === deviceId)) throw new Error("That phone is no longer paired.");
		this.store.save({ devices: this.store.value.devices.filter(device => device.id !== deviceId) });
		this.onRemoved?.(deviceId);
	}
}
