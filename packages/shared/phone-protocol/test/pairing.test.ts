import { describe, expect, it } from "vitest";
import { decodePairingLink, encodePairingLink, fromBase64url, generateKeyPair, randomToken, toBase64url, validatePairRequest } from "../src/index";

describe("pairing payload", () => {
	const payload = { v: 1 as const, desktopId: "desk-1", desktopName: "Daniel's PC", pairingCode: randomToken(), desktopPublicKey: generateKeyPair().publicKey, direct: ["http://100.64.0.2:47017"], connect: { relayUrl: "wss://connect.phaseo.app", desktopId: "desk-1" } };
	it("round-trips through a phaseo://pair link", () => {
		const link = encodePairingLink(payload);
		expect(link.startsWith("phaseo://pair?p=")).toBe(true);
		expect(decodePairingLink(link)).toEqual(payload);
		expect(decodePairingLink(link.slice("phaseo://pair?p=".length))).toEqual(payload);
	});
	it("refuses damaged or mismatched payloads", () => {
		expect(() => encodePairingLink({ ...payload, pairingCode: "short" })).toThrow("damaged");
		expect(() => encodePairingLink({ ...payload, connect: { relayUrl: "wss://connect.phaseo.app", desktopId: "other" } })).toThrow("damaged");
		expect(() => encodePairingLink({ ...payload, direct: ["file:///etc/passwd"] })).toThrow("damaged");
		expect(() => decodePairingLink("phaseo://pair?p=@@@")).toThrow("damaged");
	});
	it("validates what the phone sends to pair", () => {
		const request = { pairingCode: randomToken(), deviceName: " Pixel 9 ", devicePublicKey: generateKeyPair().publicKey };
		expect(validatePairRequest(request).deviceName).toBe("Pixel 9");
		expect(() => validatePairRequest({ ...request, devicePublicKey: "x" })).toThrow();
	});
	it("encodes base64url like the standard alphabet without padding", () => {
		for (const length of [0, 1, 2, 3, 31, 32, 33]) {
			const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 250) & 255);
			const text = toBase64url(bytes);
			expect(text).toBe(btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
			expect([...fromBase64url(text)]).toEqual([...bytes]);
		}
	});
});
