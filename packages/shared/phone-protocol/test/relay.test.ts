import { describe, expect, it } from "vitest";
import { EnvelopeChannel, generateKeyPair, parseRelayFrame, readRelayOutbound, relayDesktopAddress, relayDeviceIdPattern, relayHolds, relayPairing, sharedKey, toBase64url } from "../src/index";

describe("relay frames", () => {
	it("accepts a sealed envelope as the relay reads it, keeping hold and a pairing key", () => {
		const desktop = generateKeyPair(), phone = generateKeyPair();
		const sealed = new EnvelopeChannel(sharedKey(phone.privateKey, desktop.publicKey), "phone-one", relayDesktopAddress).seal({ id: "1", type: "list_chats" });
		expect(readRelayOutbound(sealed)).toEqual({ to: "desktop", seq: sealed.seq, nonce: sealed.nonce, ciphertext: sealed.ciphertext });
		expect(readRelayOutbound({ ...sealed, hold: true, senderPublicKey: phone.publicKey })).toMatchObject({ hold: true, senderPublicKey: phone.publicKey });
		expect(readRelayOutbound({ ...sealed, hold: false })).not.toHaveProperty("hold");
		for (const broken of [{ ...sealed, seq: -1 }, { ...sealed, nonce: "short" }, { ...sealed, ciphertext: "" }, { ...sealed, hold: "yes" }, { ...sealed, senderPublicKey: "not a key" }, { type: "remove_device" }]) {
			expect(readRelayOutbound(broken)).toBeUndefined();
		}
	});
	it("parses every frame the relay sends and ignores unknown ones", () => {
		expect(parseRelayFrame('{"type":"devices_online","deviceIds":["a"]}')).toEqual({ type: "devices_online", deviceIds: ["a"] });
		expect(parseRelayFrame('{"type":"device_offline","deviceId":"a"}')).toEqual({ type: "device_offline", deviceId: "a" });
		expect(parseRelayFrame('{"type":"desktop_online"}')).toEqual({ type: "desktop_online" });
		expect(parseRelayFrame('{"type":"error","error":"unknown_device","seq":3}')).toEqual({ type: "error", error: "unknown_device", seq: 3 });
		expect(parseRelayFrame('{"id":1,"ok":false,"error":"too_many_devices"}')).toEqual({ id: 1, ok: false, error: "too_many_devices" });
		expect(parseRelayFrame('{"type":"something_new"}')).toBeUndefined();
		expect(parseRelayFrame("not json")).toBeUndefined();
	});
	it("holds attention and the phone's actions, never live entries or replies", () => {
		expect(["attention", "send", "answer_approval", "answer_question"].every(type => relayHolds({ type }))).toBe(true);
		expect(["entries", "chat_updated", "list_chats", undefined].some(type => relayHolds({ type }))).toBe(false);
		expect(relayHolds({ id: "1", type: "send", ok: true })).toBe(false);
	});
	it("gives a pairing sign-in a device id the relay accepts", () => {
		expect(relayPairing(toBase64url(new Uint8Array(32).fill(1))).deviceId).toMatch(relayDeviceIdPattern);
	});
});
