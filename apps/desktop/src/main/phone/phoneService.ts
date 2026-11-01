import { networkInterfaces } from "node:os";
import { toQR } from "toqr";
import { connectRelayUrl, encodePairingLink, generateKeyPair, publicKeyOf, tokenHash, type KeyPair } from "@phaseo/phone-protocol";
import { phoneAddressLabels, validatePhoneSettingsUpdate, type ConnectView, type PhoneAddress, type PhoneAddressKind, type PhonePairingView, type PhoneState } from "../../shared/phone";
import { formatSpend } from "../../shared/usageAmounts";
import type { WorkspaceOverview } from "../../shared/workspaceOverview";
import { connectBillingClient, type ConnectBilling, type ConnectBillingClient } from "./connectBilling";
import { ConnectClient, type ConnectClientState } from "./connectClient";
import { PhonePairing, PhoneSettingsFile, type DeviceStore } from "./phoneDevices";
import { PhoneServer } from "./phoneServer";
import { PhoneHub, type PhoneHost } from "./phoneSession";
import { bindHosts, detectAddresses, disableTailscaleServe, ensureTailscaleServe, probeHttps, readTailscaleStatus, runCommand, tailscaleHttpsUrl, type DetectedAddresses, type NetworkInterfaces, type RunCommand } from "./tailscale";

/** The Phaseo sign-in Connect bills and signs in with. */
export type PhaseoSignIn = { label: string; workspaceId?: string; gatewayKey: () => Promise<string>; accessToken: () => Promise<string> };
export type PhoneServicePorts = {
	directory: string;
	host: PhoneHost;
	vault: { get: (id: string) => Promise<string>; set: (id: string, value: string) => Promise<void> };
	phaseo: () => PhaseoSignIn | undefined;
	changed?: (state: PhoneState) => void;
	interfaces?: () => NetworkInterfaces;
	run?: RunCommand;
	fetcher?: typeof fetch;
	relayUrl?: string;
	billing?: (signIn: PhaseoSignIn) => ConnectBillingClient;
	store?: DeviceStore;
};

const identitySecret = "phone-identity";
const refreshMs = 120_000;

/**
 * Settings → Phone in the main process: the phone server on the chosen addresses, pairing, the paired phones, Tailscale
 * HTTPS and Phaseo Connect. With phone access off nothing listens and Connect is disconnected.
 */
export class PhoneService {
	readonly store: DeviceStore;
	readonly pairing: PhonePairing;
	readonly hub: PhoneHub;
	private readonly server: PhoneServer;
	private connect?: ConnectClient;
	private connectState: ConnectClientState = { status: "stopped" };
	private billing?: ConnectBilling;
	private billingError?: string;
	private billingChecking = false;
	private detected: DetectedAddresses = { lan: [], tailscale: [], status: null };
	private hosts: string[] = [];
	private httpsReachable = false;
	private serverErrors: string[] = [];
	private identity?: KeyPair;
	private timer?: ReturnType<typeof setInterval>;
	private applying = Promise.resolve();

	constructor(private readonly ports: PhoneServicePorts) {
		this.store = ports.store ?? new PhoneSettingsFile(ports.directory);
		this.pairing = new PhonePairing(this.store);
		this.hub = new PhoneHub(ports.host);
		this.server = new PhoneServer({ hub: this.hub, pairing: this.pairing, desktopId: () => this.store.value.desktopId, desktopName: ports.host.desktopName });
		this.pairing.onPaired = device => { this.connect?.registerDevice(device.id, device.relayTokenHash); this.emit(); };
		this.pairing.onRemoved = deviceId => { this.hub.closeDevice(deviceId); this.connect?.removeDevice(deviceId); this.emit(); };
		this.pairing.onCodeExpired = relayDeviceId => this.connect?.removeDevice(relayDeviceId);
		this.hub.onAttention = (event, connected) => this.connect?.notifyOffline(event, connected);
	}

	async start() {
		if (this.store.value.connect) void this.refreshConnect();
		await this.apply();
	}
	overviewChanged(overview: WorkspaceOverview) { this.hub.overviewChanged(overview); }
	private emit() { this.ports.changed?.(this.state()); }
	/** Runs settings changes one at a time, so a quick toggle can't leave two servers. */
	private serial<T>(work: () => Promise<T>) { const next = this.applying.then(work); this.applying = next.then(() => undefined, () => undefined); return next; }

	private async detect() {
		const status = await readTailscaleStatus(this.ports.run ?? runCommand);
		this.detected = detectAddresses((this.ports.interfaces ?? networkInterfaces)(), status);
		const https = this.httpsUrl();
		this.httpsReachable = https && this.store.value.tailscaleServe ? await probeHttps(https, this.ports.fetcher) : false;
	}
	private httpsUrl() { return this.detected.status?.magicDnsName ? tailscaleHttpsUrl(this.detected.status.magicDnsName) : undefined; }

	/** Listens on the chosen addresses that exist now, and connects or disconnects Phaseo Connect. */
	private apply() {
		return this.serial(async () => {
			const settings = this.store.value;
			if (!settings.enabled) {
				clearInterval(this.timer); this.timer = undefined;
				await this.server.close(); this.hosts = []; this.serverErrors = [];
				this.hub.closeAll(); this.stopConnect(); this.emit(); return;
			}
			await this.detect();
			const hosts = bindHosts(settings.addresses, this.detected, settings.tailscaleServe);
			if (hosts.join() !== this.hosts.join() || !this.server.running !== !hosts.length) {
				this.hosts = hosts;
				if (hosts.length) this.serverErrors = (await this.server.listen(hosts, settings.port)).errors;
				else { await this.server.close(); this.serverErrors = []; }
			}
			// Wi-Fi and tailnet addresses change as the computer moves; check again now and then.
			this.timer ??= setInterval(() => void this.apply(), refreshMs);
			this.timer.unref?.();
			await this.syncConnect();
			this.emit();
		});
	}

	state(): PhoneState {
		const settings = this.store.value, connected = this.hub.connectedDevices(), port = settings.port;
		const addresses: PhoneAddress[] = (Object.keys(phoneAddressLabels) as PhoneAddressKind[]).map(kind => {
			const enabled = settings.addresses[kind];
			if (kind === "lan") return { kind, enabled, ...this.detected.lan[0] ? { url: `http://${this.detected.lan[0]}:${port}` } : { note: "No Wi-Fi or wired network found." } };
			if (kind === "tailscale-ip") return { kind, enabled, ...this.detected.tailscale[0] ? { url: `http://${this.detected.tailscale[0]}:${port}` } : { note: this.detected.status ? "Tailscale has no IP address on this computer." : "Tailscale isn't running on this computer." } };
			const https = this.httpsUrl();
			if (!https) return { kind, enabled, note: this.detected.status ? "Turn on MagicDNS for your tailnet to use HTTPS." : "Tailscale isn't running on this computer." };
			if (!settings.tailscaleServe) return { kind, enabled, note: "Set up HTTPS to serve the phone server at your Tailscale name." };
			return { kind, enabled, url: https, ...this.httpsReachable || !settings.enabled ? {} : { note: "Tailscale is serving, but the address didn't answer. Check Tailscale on this computer." } };
		});
		return {
			enabled: settings.enabled, running: this.server.running, port: this.server.running ? this.server.port : port, desktopName: this.ports.host.desktopName(),
			...settings.enabled && this.serverErrors.length ? { error: this.serverErrors.join(" ") } : settings.enabled && !this.hosts.length ? { error: "None of the chosen addresses exist on this computer right now." } : {},
			addresses,
			tailscale: { installed: Boolean(this.detected.status), httpsAvailable: this.detected.status?.httpsServeEnabled ?? null, serving: settings.tailscaleServe, ...this.detected.status?.magicDnsName ? { dnsName: this.detected.status.magicDnsName } : {} },
			devices: settings.devices.map(device => ({ id: device.id, name: device.name, pairedAt: device.pairedAt, ...device.lastSeenAt ? { lastSeenAt: device.lastSeenAt } : {}, connected: connected.has(device.id) })),
			connect: this.connectView(),
		};
	}
	/** Detects addresses again before answering, for the settings page opening. */
	async refreshedState() { if (this.store.value.enabled) await this.apply(); else await this.detect(); return this.state(); }

	async update(value: unknown) {
		const update = validatePhoneSettingsUpdate(value), settings = this.store.value;
		const addresses = { ...settings.addresses, ...update.addresses };
		const enabled = update.enabled ?? settings.enabled;
		// Serving stops with phone access or with the HTTPS address, so Tailscale doesn't keep forwarding to nothing.
		if (settings.tailscaleServe && (!enabled || !addresses["tailscale-https"])) { await disableTailscaleServe(this.ports.run ?? runCommand); this.store.save({ tailscaleServe: false }); }
		if (enabled && !settings.enabled) await this.loadIdentity();
		this.store.save({ enabled, addresses });
		await this.apply();
		return this.state();
	}

	async setupHttps() {
		const settings = this.store.value;
		if (!settings.enabled) throw new Error("Turn on phone access first.");
		await ensureTailscaleServe(settings.port, this.ports.run ?? runCommand);
		this.store.save({ tailscaleServe: true, addresses: { ...settings.addresses, "tailscale-https": true } });
		this.hosts = [];
		await this.apply();
		return this.state();
	}

	private async loadIdentity() {
		if (this.identity) return this.identity;
		try { const privateKey = await this.ports.vault.get(identitySecret); this.identity = { privateKey, publicKey: publicKeyOf(privateKey) }; }
		catch {
			const created = generateKeyPair();
			await this.ports.vault.set(identitySecret, created.privateKey);
			this.identity = created;
		}
		return this.identity;
	}

	/** A pairing code for the QR code and link, with every address a phone could use now. */
	async pair(): Promise<PhonePairingView> {
		const settings = this.store.value;
		if (!settings.enabled) throw new Error("Turn on phone access first.");
		const identity = await this.loadIdentity(), state = this.state();
		const direct = state.running ? state.addresses.filter(address => address.enabled && address.url && !address.note).map(address => address.url!) : [];
		const connect = this.connectState.status === "connected" ? { relayUrl: this.relayUrl(), desktopId: settings.desktopId } : undefined;
		if (!direct.length && !connect) throw new Error("Phones can't reach this computer yet. Turn on an address that exists here, or Phaseo Connect.");
		const code = this.pairing.create();
		this.connect?.registerDevice(code.relay.deviceId, tokenHash(code.relay.relayToken));
		const link = encodePairingLink({ v: 1, desktopId: settings.desktopId, desktopName: this.ports.host.desktopName().slice(0, 100), pairingCode: code.pairingCode, desktopPublicKey: identity.publicKey, direct, ...connect ? { connect } : {} });
		const modules = toQR(link), size = Math.round(Math.sqrt(modules.length));
		return { link, qr: { size, modules: Array.from(modules, value => value ? "1" : "0").join("") }, expiresAt: code.expiresAt };
	}
	removeDevice(id: unknown) {
		if (typeof id !== "string") throw new Error("Invalid phone.");
		this.pairing.remove(id);
		return this.state();
	}

	private relayUrl() { return this.ports.relayUrl ?? connectRelayUrl; }
	private billingClient() { const signIn = this.ports.phaseo(); return signIn ? { signIn, client: (this.ports.billing ?? (value => connectBillingClient({ accessToken: value.accessToken, workspaceId: value.workspaceId, fetcher: this.ports.fetcher })))(signIn) } : undefined; }
	/**
	 * Reads what Phaseo says about Connect for this workspace. A relay refusal (payment due, switched off) stops
	 * reconnecting; only the person's Check again (retryRefused) tries the relay again.
	 */
	async refreshConnect(retryRefused = false) {
		const billing = this.billingClient();
		if (!billing) { this.billing = undefined; this.emit(); return this.state(); }
		this.billingChecking = true; this.emit();
		try { this.billing = await billing.client.read(); this.billingError = undefined; if (this.billing.enabled !== this.store.value.connect) this.store.save({ connect: this.billing.enabled }); }
		catch (error) { this.billingError = error instanceof Error ? error.message : String(error); }
		finally { this.billingChecking = false; }
		await this.serial(() => this.syncConnect(retryRefused));
		this.emit();
		return this.state();
	}
	/** The person's click on the Connect switch: Phaseo starts or stops the monthly charge, then the relay connects or not. */
	async setConnect(enabled: unknown) {
		if (typeof enabled !== "boolean") throw new Error("Invalid request.");
		const billing = this.billingClient();
		if (!billing) throw new Error("Sign in to Phaseo in Settings → Accounts to use Phaseo Connect.");
		this.billing = await billing.client.set(enabled); this.billingError = undefined;
		this.store.save({ connect: this.billing.enabled });
		await this.serial(() => this.syncConnect(true));
		this.emit();
		return this.state();
	}
	private async syncConnect(retryRefused = false) {
		const settings = this.store.value, signIn = this.ports.phaseo();
		const wanted = settings.enabled && settings.connect && Boolean(signIn) && this.billing?.enabled === true && !this.billing.paymentDue;
		if (!wanted) { this.stopConnect(); return; }
		if (this.connect && !(retryRefused && this.connect.state.status === "refused")) return;
		this.stopConnect();
		const identity = await this.loadIdentity();
		const client: ConnectClient = this.connect = new ConnectClient({
			relayUrl: this.relayUrl(), desktopId: settings.desktopId, desktopName: this.ports.host.desktopName, privateKey: identity.privateKey,
			gatewayKey: () => signIn!.gatewayKey(), devices: () => this.store.value.devices, pairing: this.pairing, hub: this.hub,
			onState: state => {
				if (this.connect !== client) return;
				this.connectState = state; this.emit();
				// The relay knows first; read the unpaid amount or the switched-off state for Settings.
				if (state.reason === "payment-due" || state.reason === "connect-off") void this.refreshConnect();
			},
		});
		this.connect.start();
	}
	private stopConnect() { const client = this.connect; this.connect = undefined; client?.stop(); this.connectState = { status: "stopped" }; }

	private connectView(): ConnectView {
		const settings = this.store.value, signIn = this.ports.phaseo();
		const billing = this.billing;
		const amounts = billing ? { canManage: billing.canManage, daysOn: billing.daysOn, chargeSoFarNanos: billing.chargeSoFarNanos, estimatedNanos: billing.estimatedNanos } : {};
		const base = { enabled: settings.connect, ...signIn ? { account: billing?.workspaceName ? `${signIn.label} · ${billing.workspaceName}` : signIn.label } : {}, ...amounts };
		if (!signIn) return { ...base, status: "signed-out", message: "Sign in to Phaseo in Settings → Accounts to use Phaseo Connect." };
		if (this.billingChecking) return { ...base, status: "checking" };
		if (this.billingError) return { ...base, status: "error", message: this.billingError };
		// Money owed shows even with the switch off: the months it was on are still charged.
		if (billing?.paymentDue) {
			const months = billing.unpaidMonths === 1 ? "1 month" : `${billing.unpaidMonths} months`;
			return { ...base, status: "payment-due", message: `Payment due: ${formatSpend(billing.unpaidNanos)} for ${months}. Phaseo Connect is off until it's paid from your credits. Add credits and it turns back on.` };
		}
		if (this.connectState.reason === "payment-due") return { ...base, status: "payment-due", message: this.connectState.message };
		if (!settings.connect) return { ...base, status: "off" };
		if (!settings.enabled) return { ...base, status: "off", message: "Turn on phone access to connect." };
		if (this.connectState.status === "connected") return { ...base, status: "connected" };
		if (this.connectState.status === "refused") return { ...base, status: "error", message: this.connectState.message };
		return { ...base, status: "connecting" };
	}

	async stop() {
		clearInterval(this.timer); this.timer = undefined;
		this.stopConnect(); this.hub.closeAll();
		await this.server.close();
	}
}
