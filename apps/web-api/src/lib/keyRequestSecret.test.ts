import { describe, expect, it } from "vitest";
import { decryptKeyRequestSecret, encryptKeyRequestSecret } from "./keyRequestSecret";

const REQUEST = "00000000-0000-4000-8000-0000000000aa";
const PLAINTEXT = "phaseo_v1_sk_abcdefghijkl_0123456789abcdefghijABCDEFGHIJ0123456789";
// apps/api/src/routes/v1/control/key-requests.test.ts opens this exact value with the gateway's copy of the code.
const SEALED = "v1.AQIDBAUGBwgJCgsM.EdZB0EFDmv5c4NO1SBsCw7B3XvwtxPzlPHB2WJwIgouzPZl_OZEsv1p0tWpS_mqi2qlsQcTU3d_4jP9PQ-8U9PCnRmiK2SWyqpO2SsKKMrGGrw";

describe("key request secrets", () => {
	it("seals the same way as the gateway opens it", async () => {
		const iv = new Uint8Array(12).map((_, index) => index + 1);
		expect(await encryptKeyRequestSecret("test-pepper-active", REQUEST, PLAINTEXT, iv)).toBe(SEALED);
	});

	it("round-trips with a random IV, and opens only for its own request and pepper", async () => {
		const sealed = await encryptKeyRequestSecret("pepper", REQUEST, PLAINTEXT);
		expect(sealed).not.toContain(PLAINTEXT);
		expect(await decryptKeyRequestSecret(["pepper"], REQUEST, sealed)).toBe(PLAINTEXT);
		expect(await decryptKeyRequestSecret(["other"], REQUEST, sealed)).toBeNull();
		expect(await decryptKeyRequestSecret(["pepper"], "00000000-0000-4000-8000-0000000000ab", sealed)).toBeNull();
	});

	it("refuses to seal without a pepper", async () => {
		await expect(encryptKeyRequestSecret(" ", REQUEST, PLAINTEXT)).rejects.toThrow("key_pepper_unavailable");
	});
});
