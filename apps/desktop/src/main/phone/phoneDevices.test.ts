import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPair, relayPairing, tokenHash } from "@phaseo/phone-protocol";
import { PhonePairing, PhoneSettingsFile } from "./phoneDevices";

describe("phone pairing", () => {
	const folders: string[] = [];
	afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); });
	const setup = () => {
		const folder = mkdtempSync(path.join(tmpdir(), "phaseo-phone-")); folders.push(folder);
		let now = Date.parse("2026-11-01T10:00:00.000Z");
		const store = new PhoneSettingsFile(folder), pairing = new PhonePairing(store, () => now);
		return { folder, store, pairing, advance: (ms: number) => { now += ms; } };
	};
	const request = (pairingCode: string) => ({ pairingCode, deviceName: "Pixel 9", devicePublicKey: generateKeyPair().publicKey });

	it("pairs once with a code and keeps only the relay token's hash", () => {
		const { folder, pairing } = setup();
		const { pairingCode } = pairing.create();
		const { device, result } = pairing.redeem(request(pairingCode));
		expect(result.deviceId).toBe(device.id);
		expect(pairing.device(result.deviceId)?.publicKey).toBe(device.publicKey);
		expect(result).not.toHaveProperty("deviceToken");
		expect(device.relayTokenHash).toBe(tokenHash(result.relayToken));
		const saved = readFileSync(path.join(folder, "phone.json"), "utf8");
		expect(saved).not.toContain(result.relayToken);
		expect(saved).not.toContain(pairingCode);
		expect(() => pairing.redeem(request(pairingCode))).toThrow("expired or was already used");
		expect(pairing.device("wrong")).toBeUndefined();
	});
	it("refuses a code after ten minutes and tells Connect to drop its sign-in", () => {
		const { pairing, advance } = setup();
		const expired: string[] = [];
		pairing.onCodeExpired = id => expired.push(id);
		const { pairingCode } = pairing.create();
		advance(10 * 60_000 - 1);
		expect(pairing.relayCodes()).toEqual([{ deviceId: relayPairing(pairingCode).deviceId, relayTokenHash: tokenHash(relayPairing(pairingCode).relayToken) }]);
		advance(1);
		expect(() => pairing.redeem(request(pairingCode))).toThrow("expired");
		expect(expired).toEqual([relayPairing(pairingCode).deviceId]);
	});
	it("revokes a removed phone at once and remembers phones across restarts", () => {
		const { folder, pairing } = setup();
		const removed: string[] = [];
		pairing.onRemoved = id => removed.push(id);
		const first = pairing.redeem(request(pairing.create().pairingCode)), second = pairing.redeem(request(pairing.create().pairingCode));
		pairing.remove(first.device.id);
		expect(removed).toEqual([first.device.id]);
		expect(pairing.device(first.result.deviceId)).toBeUndefined();
		expect(() => pairing.remove(first.device.id)).toThrow("no longer paired");
		const reopened = new PhonePairing(new PhoneSettingsFile(folder));
		expect(reopened.device(second.result.deviceId)?.name).toBe("Pixel 9");
		expect(reopened.device(first.result.deviceId)).toBeUndefined();
	});
	it("starts off, with Tailscale on and Wi-Fi off", () => {
		const { store } = setup();
		expect(store.value).toMatchObject({ enabled: false, connect: false, addresses: { lan: false, "tailscale-ip": true, "tailscale-https": true }, devices: [] });
	});
});
