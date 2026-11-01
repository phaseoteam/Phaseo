import { afterEach, describe, expect, it, vi } from "vitest";
import { decodePairingLink, publicKeyOf } from "@phaseo/phone-protocol";
import { fakePhoneHost } from "./fakePhoneHost";
import type { ConnectBilling } from "./connectBilling";
import type { PhoneSettings } from "./phoneDevices";
import { PhoneService, type PhaseoSignIn } from "./phoneService";

const status = JSON.stringify({ Self: { DNSName: "desk.tail1234.ts.net.", TailscaleIPs: ["100.101.1.2"], CapMap: { https: null } } });

describe("phone service", () => {
	const services: PhoneService[] = [];
	afterEach(async () => { for (const service of services.splice(0)) await service.stop(); });
	function setup({ signIn, billing }: { signIn?: PhaseoSignIn; billing?: ConnectBilling } = {}) {
		let settings: PhoneSettings = { enabled: false, port: 0, addresses: { lan: false, "tailscale-ip": false, "tailscale-https": true }, desktopId: "desk-1", tailscaleServe: true, connect: false, devices: [] };
		const store = { get value() { return settings; }, save: (change: Partial<PhoneSettings> = {}) => (settings = { ...settings, ...change }) };
		const secrets = new Map<string, string>();
		const run = vi.fn(async (_file: string, args: string[]) => args[0] === "status" ? status : "");
		const billingClient = { read: vi.fn(async () => billing!), set: vi.fn(async (enabled: boolean) => ({ ...billing!, enabled })) };
		const service = new PhoneService({
			directory: "unused", store, host: fakePhoneHost().host, run, interfaces: () => ({}), fetcher: (async () => new Response("{}")) as typeof fetch,
			vault: { get: async id => { const value = secrets.get(id); if (!value) throw new Error("missing"); return value; }, set: async (id, value) => { secrets.set(id, value); } },
			phaseo: () => signIn, billing: () => billingClient, relayUrl: "ws://127.0.0.1:9",
		});
		services.push(service);
		return { service, run, secrets, billingClient, settings: () => settings };
	}

	it("listens only while phone access is on, and pairs with the addresses that answer", async () => {
		const { service, run, secrets, settings } = setup();
		await service.start();
		expect(service.state()).toMatchObject({ enabled: false, running: false });
		await expect(service.pair()).rejects.toThrow("Turn on phone access first.");

		const on = await service.update({ enabled: true });
		expect(on).toMatchObject({ enabled: true, running: true, tailscale: { installed: true, httpsAvailable: true, serving: true, dnsName: "desk.tail1234.ts.net" } });
		expect(on.addresses.find(address => address.kind === "tailscale-https")).toEqual({ kind: "tailscale-https", enabled: true, url: "https://desk.tail1234.ts.net/" });
		const pairing = await service.pair();
		const payload = decodePairingLink(pairing.link);
		expect(payload).toMatchObject({ v: 1, desktopId: "desk-1", desktopName: "Test PC", direct: ["https://desk.tail1234.ts.net/"] });
		expect(payload.connect).toBeUndefined();
		expect(payload.desktopPublicKey).toBe(publicKeyOf(secrets.get("phone-identity")!));
		expect(pairing.qr.modules).toHaveLength(pairing.qr.size ** 2);

		const off = await service.update({ enabled: false });
		expect(off).toMatchObject({ enabled: false, running: false });
		expect(run).toHaveBeenCalledWith(process.platform === "win32" ? "tailscale.exe" : "tailscale", ["serve", "--https=443", "off"], 10_000);
		expect(settings().tailscaleServe).toBe(false);
	});
	it("needs a Phaseo sign-in for Connect, and shows the payment due while a month is unpaid", async () => {
		await expect(setup().service.setConnect(true)).rejects.toThrow("Sign in to Phaseo");
		const signIn = { label: "daniel@example.com", gatewayKey: async () => "key", accessToken: async () => "access" };
		const billing = { enabled: false, paymentDue: true, canManage: true, daysOn: 12, chargeSoFarNanos: 400_000_000, estimatedNanos: 1_000_000_000, unpaidMonths: 1, unpaidNanos: 1_000_000_000, workspaceName: "Acme" };
		const { service, billingClient } = setup({ signIn, billing });
		await service.update({ enabled: true });
		const state = await service.setConnect(true);
		expect(billingClient.set).toHaveBeenCalledWith(true);
		expect(state.connect).toMatchObject({ status: "payment-due", enabled: true, account: "daniel@example.com · Acme", daysOn: 12, chargeSoFarNanos: 400_000_000, estimatedNanos: 1_000_000_000 });
		expect(state.connect.message).toBe("Payment due: $1.00 for 1 month. Phaseo Connect is off until it's paid from your credits. Add credits and it turns back on.");
		// Switching off doesn't hide what's owed.
		expect((await service.setConnect(false)).connect).toMatchObject({ status: "payment-due", enabled: false });
		billingClient.set.mockImplementation(async (enabled: boolean) => ({ ...billing, enabled, paymentDue: false, unpaidMonths: 0, unpaidNanos: 0 }));
		expect((await service.setConnect(false)).connect).toMatchObject({ status: "off", enabled: false });
	});
});
