import { describe, expect, it } from "vitest";
import { EnvelopeChannel, fromBase64url, generateKeyPair, openEnvelope, relayPairing, sealEnvelope, sharedKey, toBase64url, tokenHash } from "../src/index";

describe("envelopes", () => {
	const desktop = generateKeyPair(), phone = generateKeyPair();
	it("both sides derive the same key", () => {
		expect(toBase64url(sharedKey(desktop.privateKey, phone.publicKey))).toBe(toBase64url(sharedKey(phone.privateKey, desktop.publicKey)));
	});
	it("round-trips a frame between a desktop and a phone channel", () => {
		const desktopSide = new EnvelopeChannel(sharedKey(desktop.privateKey, phone.publicKey), "desk", "dev");
		const phoneSide = new EnvelopeChannel(sharedKey(phone.privateKey, desktop.publicKey), "dev", "desk");
		const envelope = phoneSide.seal({ id: "1", type: "send", chatId: "c", text: "héllo 👋" });
		expect(envelope).toMatchObject({ to: "desk", from: "dev" });
		expect(envelope.ciphertext).not.toContain("hello");
		expect(JSON.parse(desktopSide.open(envelope))).toMatchObject({ text: "héllo 👋" });
		const reply = desktopSide.seal({ type: "pong" });
		expect(JSON.parse(phoneSide.open(reply))).toEqual({ type: "pong" });
	});
	it("refuses a changed ciphertext, a moved route, a replay and the wrong key", () => {
		const key = sharedKey(desktop.privateKey, phone.publicKey);
		const sealed = sealEnvelope(key, { to: "desk", from: "dev", seq: 5 }, "secret");
		const bytes = fromBase64url(sealed.ciphertext); bytes[0] = bytes[0]! ^ 1;
		expect(() => openEnvelope(key, { ...sealed, ciphertext: toBase64url(bytes) })).toThrow("could not be opened");
		expect(() => openEnvelope(key, { ...sealed, seq: 6 })).toThrow("could not be opened");
		expect(() => openEnvelope(key, { ...sealed, from: "other" })).toThrow("could not be opened");
		expect(() => openEnvelope(sharedKey(generateKeyPair().privateKey, phone.publicKey), sealed)).toThrow("could not be opened");
		const channel = new EnvelopeChannel(key, "desk", "dev");
		expect(channel.open(sealed)).toBe("secret");
		expect(() => channel.open(sealed)).toThrow("already delivered");
		expect(() => channel.open({ ...sealed, to: "elsewhere" })).toThrow("someone else");
	});
	it("derives a pairing relay token the relay can't turn back into the code", () => {
		const code = toBase64url(new Uint8Array(32).fill(7));
		const first = relayPairing(code);
		expect(first).toEqual(relayPairing(code));
		expect(first.relayToken).not.toBe(code);
		expect(first.deviceId).toMatch(/^pair-[0-9a-f]{24}$/);
		expect(tokenHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
	});
});
