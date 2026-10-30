import { parsePasskeyCreationOptions } from "./passkeyWebAuthn";

describe("parsePasskeyCreationOptions", () => {
	it("decodes the challenge, user id, and excluded credential ids", () => {
		const originalPublicKeyCredential = globalThis.PublicKeyCredential;
		Object.defineProperty(globalThis, "PublicKeyCredential", {
			configurable: true,
			value: class {},
		});

		try {
			const parsed = parsePasskeyCreationOptions({
				challenge: "AQID",
				excludeCredentials: [{ id: "BAUG", type: "public-key" }],
				pubKeyCredParams: [{ alg: -7, type: "public-key" }],
				rp: { name: "Phaseo" },
				user: { displayName: "User", id: "BwgJ", name: "user" },
			});

			expect(
				Array.from(new Uint8Array(parsed.challenge as ArrayBuffer)),
			).toEqual([1, 2, 3]);
			expect(
				Array.from(new Uint8Array(parsed.user.id as ArrayBuffer)),
			).toEqual([7, 8, 9]);
			expect(
				Array.from(
					new Uint8Array(
						(parsed.excludeCredentials?.[0]?.id ??
							new ArrayBuffer(0)) as ArrayBuffer,
					),
				),
			).toEqual([4, 5, 6]);
		} finally {
			Object.defineProperty(globalThis, "PublicKeyCredential", {
				configurable: true,
				value: originalPublicKeyCredential,
			});
		}
	});

	it("rejects malformed server options", () => {
		expect(() => parsePasskeyCreationOptions({ challenge: "AQID" })).toThrow(
			"Passkey user options are invalid",
		);
	});
});
