import { describe, expect, it, vi } from "vitest";

const MASTER_KEY = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 1));
const MASTER_KEY_B64 = btoa(String.fromCharCode(...MASTER_KEY));

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({ BYOK_ACTIVE_KEY_VERSION: "1" }),
	getByokKey: () => MASTER_KEY_B64,
}));

function toHex(bytes: Uint8Array) {
	return `\\x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

describe("provider credential encryption", () => {
	it("binds new ciphertext to its workspace and provider", async () => {
		const { encryptProviderCredential } = await import("./provider-credentials");
		const { bytesToString, decryptBYOK } = await import("@/pipeline/byok/decrypt");
		const encrypted = await encryptProviderCredential({ plaintext: "sk-project-secret-value", workspaceId: "workspace_1", providerId: "openai" });
		// Stored with the row, so the row is never read as legacy (no-AAD) ciphertext.
		expect(encrypted.enc_aad_version).toBe(1);
		const plaintext = await decryptBYOK({ ...encrypted, workspace_id: "workspace_1", provider_id: "openai" });
		expect(bytesToString(plaintext)).toBe("sk-project-secret-value");
		await expect(decryptBYOK({ ...encrypted, workspace_id: "workspace_2", provider_id: "openai" })).rejects.toThrow();
	});

	it("continues decrypting credentials created before bound metadata", async () => {
		const { bytesToString, decryptBYOK } = await import("@/pipeline/byok/decrypt");
		const key = await crypto.subtle.importKey("raw", MASTER_KEY, "AES-GCM", false, ["encrypt"]);
		const iv = new Uint8Array(12).fill(7);
		const combined = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode("legacy-provider-secret")));
		const encrypted = {
			enc_iv: toHex(iv), enc_value: toHex(combined.slice(0, -16)), enc_tag: toHex(combined.slice(-16)), key_version: 1,
			workspace_id: "workspace_1", provider_id: "openai",
		};
		const plaintext = await decryptBYOK(encrypted);
		expect(bytesToString(plaintext)).toBe("legacy-provider-secret");
	});
});
