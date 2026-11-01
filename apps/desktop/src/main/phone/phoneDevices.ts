import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pairingLifetimeMs, relayPairing, tokenHash, validatePairRequest, type PairResult } from "@phaseo/phone-protocol";
import { defaultPhonePort, type PhoneAddressKind } from "../../shared/phone";

export type PhoneDeviceRecord = { id: string; name: string; publicKey: string; relayTokenHash: string; pairedAt: string; lastSeenAt?: string };
/** Settings → Phone as kept on disk. Tokens are kept only as hashes; the identity key is in the credential vault. */
export type PhoneSettings = { enabled: boolean; port: number; addresses: Record<PhoneAddressKind, boolean>; desktopId: string; tailscaleServe: boolean; connect: boolean; devices: PhoneDeviceRecord[] };
const defaults = (): PhoneSettings => ({ enabled: false, port: defaultPhonePort, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": true }, desktopId: randomUUID(), tailscaleServe: false, connect: false, devices: [] });
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
				devices: (Array.isArray(stored.devices) ? stored.devices : []).filter(device => device && text(device.id) && text(device.name) && text(device.publicKey) && text(device.relayTokenHash) && text(device.pairedAt)),
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
	private readonly codes = new Map<string, { expiresAt: number; relayDeviceId: string; relayTokenHash: string }>();
	onPaired?: (device: PhoneDeviceRecord) => void;
	onRemoved?: (deviceId: string) => void;
	onCodeExpired?: (relayDeviceId: string) => void;
	constructor(private readonly store: DeviceStore, private readonly now: () => number = Date.now) {}

	create() {
		this.prune();
		// A few at once covers a person who reopens the dialog; older ones stay valid until they expire.
		if (this.codes.size >= 5) { const oldest = [...this.codes.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0]!; this.codes.delete(oldest[0]); this.onCodeExpired?.(oldest[1].relayDeviceId); }
		const pairingCode = randomBytes(32).toString("base64url"), expiresAt = this.now() + pairingLifetimeMs, relay = relayPairing(pairingCode);
		this.codes.set(sha(pairingCode), { expiresAt, relayDeviceId: relay.deviceId, relayTokenHash: tokenHash(relay.relayToken) });
		return { pairingCode, expiresAt: new Date(expiresAt).toISOString(), relay };
	}
	private prune() {
		for (const [hash, code] of this.codes) if (code.expiresAt <= this.now()) { this.codes.delete(hash); this.onCodeExpired?.(code.relayDeviceId); }
	}
	/** Pairs a phone with a code, once. Throws the same message for an unknown, used or expired code. */
	redeem(value: unknown): { device: PhoneDeviceRecord; result: Omit<PairResult, "desktopName"> } {
		const request = validatePairRequest(value);
		this.prune();
		const hash = sha(request.pairingCode), code = this.codes.get(hash);
		if (!code) throw new Error("This pairing code has expired or was already used. Show a new one on the computer.");
		this.codes.delete(hash);
		if (this.store.value.devices.length >= 20) throw new Error("Remove a phone before pairing another; up to 20 are kept.");
		const relayToken = randomBytes(32).toString("base64url");
		const device: PhoneDeviceRecord = { id: randomUUID(), name: request.deviceName, publicKey: request.devicePublicKey, relayTokenHash: tokenHash(relayToken), pairedAt: new Date(this.now()).toISOString() };
		this.store.save({ devices: [...this.store.value.devices, device] });
		// After the caller has answered the phone: over Phaseo Connect, ending the pairing sign-in closes its socket.
		queueMicrotask(() => this.onCodeExpired?.(code.relayDeviceId));
		this.onPaired?.(device);
		return { device, result: { deviceId: device.id, relayToken, desktopId: this.store.value.desktopId } };
	}
	device(deviceId: string) { return this.store.value.devices.find(device => device.id === deviceId); }
	/** Pending codes' relay sign-ins, for Phaseo Connect to register. */
	relayCodes() { this.prune(); return [...this.codes.values()].map(code => ({ deviceId: code.relayDeviceId, relayTokenHash: code.relayTokenHash })); }
	hasRelayCode(relayDeviceId: string) { this.prune(); return [...this.codes.values()].some(code => code.relayDeviceId === relayDeviceId); }
	/** Last seen is kept to the minute, so a busy phone doesn't rewrite the file on every frame. */
	seen(deviceId: string) {
		const device = this.store.value.devices.find(value => value.id === deviceId);
		if (!device || (device.lastSeenAt && this.now() - Date.parse(device.lastSeenAt) < 60_000)) return;
		this.store.save({ devices: this.store.value.devices.map(value => value.id === deviceId ? { ...value, lastSeenAt: new Date(this.now()).toISOString() } : value) });
	}
	remove(deviceId: string) {
		if (!this.store.value.devices.some(device => device.id === deviceId)) throw new Error("That phone is no longer paired.");
		this.store.save({ devices: this.store.value.devices.filter(device => device.id !== deviceId) });
		this.onRemoved?.(deviceId);
	}
}
