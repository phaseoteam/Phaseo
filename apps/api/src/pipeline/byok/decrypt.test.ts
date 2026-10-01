import { beforeEach, describe, expect, it, vi } from "vitest";

const getByokKeyMock = vi.fn();
vi.mock("@/runtime/env", () => ({
	getByokKey: (version: number) => getByokKeyMock(version),
}));

import { bytesToString, decryptBYOK } from "./decrypt";

function toBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}

async function encryptedRow(args: { useAad: boolean; workspaceId?: string; providerId?: string }) {
	const workspaceId = args.workspaceId ?? "workspace-1";
	const providerId = args.providerId ?? "openai";
	const rawKey = crypto.getRandomValues(new Uint8Array(32));
	getByokKeyMock.mockReturnValue(toBase64(rawKey));
	const key = await crypto.subtle.importKey("raw", Uint8Array.from(rawKey).buffer, "AES-GCM", false, ["encrypt"]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const additionalData = new TextEncoder().encode(`${workspaceId}|${providerId}|v1`);
	const encrypted = new Uint8Array(await crypto.subtle.encrypt({
		name: "AES-GCM",
		iv: Uint8Array.from(iv).buffer,
		...(args.useAad ? { additionalData: Uint8Array.from(additionalData).buffer } : {}),
	}, key, new TextEncoder().encode("sk-test-secret")));
	return {
		key_version: 1,
		enc_iv_b64: toBase64(iv),
		enc_ct_b64: toBase64(encrypted.slice(0, -16)),
		enc_tag_b64: toBase64(encrypted.slice(-16)),
		workspace_id: workspaceId,
		provider_id: providerId,
	};
}

describe("decryptBYOK", () => {
	beforeEach(() => getByokKeyMock.mockReset());

	it("imports once per version within a hydration and imports anew for the next request", async () => {
		const row = await encryptedRow({ useAad: true });
		const importKey = vi.spyOn(crypto.subtle, "importKey");
		try {
			const keys = new Map<number, Promise<CryptoKey>>();
			const decrypted = await Promise.all(Array.from({ length: 12 }, () => decryptBYOK({ ...row, enc_aad_version: 1 }, keys)));
			expect(decrypted.every((bytes) => bytesToString(bytes) === "sk-test-secret")).toBe(true);
			expect(importKey).toHaveBeenCalledTimes(1);
			await decryptBYOK({ ...row, enc_aad_version: 1 }, new Map());
			expect(importKey).toHaveBeenCalledTimes(2);
		} finally { importKey.mockRestore(); }
	});

	it("decrypts context-bound ciphertext and rejects a moved row", async () => {
		const row = await encryptedRow({ useAad: true });
		const plaintext = await decryptBYOK({ ...row, enc_aad_version: 1 });
		expect(bytesToString(plaintext)).toBe("sk-test-secret");
		await expect(decryptBYOK({ ...row, workspace_id: "workspace-2", enc_aad_version: 1 })).rejects.toBeDefined();
	});

	it("retains compatibility with legacy ciphertext without associated data", async () => {
		const row = await encryptedRow({ useAad: false });
		const plaintext = await decryptBYOK({ ...row, enc_aad_version: 0 });
		expect(bytesToString(plaintext)).toBe("sk-test-secret");
	});
});
