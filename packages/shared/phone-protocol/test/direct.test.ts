import { describe, expect, it } from "vitest";
import {
	checkDirectAuth, checkDirectWelcome, directAuth, directChallenge, EnvelopeChannel, generateKeyPair, openPairRequest, openPairResponse,
	randomToken, readDirectChallenge, relayDesktopAddress, sealPairRequest, sealPairResponse, sharedKey,
} from "../src/index";

describe("direct connections", () => {
	const desktop = generateKeyPair(), phone = generateKeyPair();
	const channels = () => ({
		desktopSide: new EnvelopeChannel(sharedKey(desktop.privateKey, phone.publicKey), relayDesktopAddress, "dev-1"),
		phoneSide: new EnvelopeChannel(sharedKey(phone.privateKey, desktop.publicKey), "dev-1", relayDesktopAddress),
	});

	it("signs a phone in by its key, and the desktop by its own, without a token", () => {
		const challenge = directChallenge();
		expect(readDirectChallenge(JSON.stringify(challenge))).toEqual(challenge);
		const { desktopSide, phoneSide } = channels();
		const { envelope, reply } = directAuth(phoneSide, challenge.challenge);
		expect(JSON.stringify(envelope)).not.toContain(challenge.challenge);
		const welcome = checkDirectAuth(desktopSide, envelope, challenge.challenge);
		expect(() => checkDirectWelcome(phoneSide, desktopSide.seal(welcome), reply)).not.toThrow();
		// Frames after it travel on the same channels.
		expect(JSON.parse(desktopSide.open(phoneSide.seal({ id: "1", type: "list_chats" })))).toEqual({ id: "1", type: "list_chats" });
	});

	it("refuses another socket's challenge, another key, a replay and a desktop that can't echo the reply", () => {
		const { desktopSide, phoneSide } = channels();
		const old = directAuth(phoneSide, directChallenge().challenge);
		expect(() => checkDirectAuth(desktopSide, old.envelope, directChallenge().challenge)).toThrow("didn't prove its key");
		const stranger = new EnvelopeChannel(sharedKey(generateKeyPair().privateKey, desktop.publicKey), "dev-1", relayDesktopAddress);
		const fresh = channels(), challenge = directChallenge().challenge;
		expect(() => checkDirectAuth(fresh.desktopSide, directAuth(stranger, challenge).envelope, challenge)).toThrow();
		const signIn = directAuth(fresh.phoneSide, challenge);
		checkDirectAuth(fresh.desktopSide, signIn.envelope, challenge);
		expect(() => checkDirectAuth(fresh.desktopSide, signIn.envelope, challenge)).toThrow("already delivered");
		expect(() => checkDirectWelcome(fresh.phoneSide, fresh.desktopSide.seal({ type: "welcome", reply: randomToken() }), signIn.reply)).toThrow("didn't prove its key");
		expect(readDirectChallenge('{"type":"challenge","v":1,"challenge":"short"}')).toBeUndefined();
	});

	it("seals POST /pair both ways, so the code and the result never cross in the clear", () => {
		const request = { pairingCode: randomToken(), deviceName: "Pixel", devicePublicKey: phone.publicKey };
		const body = sealPairRequest(phone.privateKey, desktop.publicKey, request);
		expect(JSON.stringify(body)).not.toContain(request.pairingCode);
		expect(openPairRequest(desktop.privateKey, JSON.parse(JSON.stringify(body)))).toEqual(request);
		// Someone on the network can't swap in their own key.
		expect(() => openPairRequest(desktop.privateKey, { ...body, devicePublicKey: generateKeyPair().publicKey })).toThrow("Invalid pairing request.");
		expect(() => openPairRequest(generateKeyPair().privateKey, body)).toThrow("Invalid pairing request.");

		const result = { deviceId: "dev-1", relayToken: randomToken(), desktopId: "desk-1", desktopName: "PC" };
		const answer = sealPairResponse(desktop.privateKey, phone.publicKey, result);
		expect(JSON.stringify(answer)).not.toContain(result.relayToken);
		expect(openPairResponse(phone.privateKey, desktop.publicKey, JSON.parse(JSON.stringify(answer)))).toEqual(result);
		// Only the desktop holding the QR code's key could have answered; a request can't be reflected as an answer.
		expect(() => openPairResponse(phone.privateKey, generateKeyPair().publicKey, answer)).toThrow("invalid pairing response");
		expect(() => openPairResponse(phone.privateKey, desktop.publicKey, body)).toThrow("invalid pairing response");
	});
});
