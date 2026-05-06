import { describe, expect, it } from "vitest";
import { resolveProviderKey } from "./keys";

describe("resolveProviderKey", () => {
	it("throws a coded missing-key error when no BYOK or gateway key exists", () => {
		expect(() =>
			resolveProviderKey(
				{
					providerId: "openai",
					byokMeta: [],
				},
				() => undefined,
			)
		).toThrowError("openai_key_missing");

		try {
			resolveProviderKey(
				{
					providerId: "openai",
					byokMeta: [],
				},
				() => undefined,
			);
		} catch (error) {
			expect((error as any)?.code).toBe("openai_key_missing");
		}
	});

	it("prefers a non-empty BYOK key over the fallback gateway key", () => {
		const resolved = resolveProviderKey(
			{
				providerId: "openai",
				byokMeta: [{
					id: "byok_1",
					providerId: "openai",
					fingerprintSha256: "fingerprint",
					keyVersion: null,
					alwaysUse: true,
					key: "sk-byok",
				}] as any,
			},
			() => "sk-gateway",
		);

		expect(resolved).toEqual({
			key: "sk-byok",
			source: "byok",
			byokId: "byok_1",
		});
	});
});
