import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecretVault } from "./secretVault";
import { isNativeAuthUrl } from "./accountConnections";

describe("credential boundaries", () => {
	it("decrypts a credential once for many readers, and again once it changes or fails", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try {
			let decryptions = 0, fail = false;
			const vault = new SecretVault(directory, { available: () => true, encrypt: value => Buffer.from(value), decrypt: async value => { decryptions++; await new Promise(resolve => setTimeout(resolve, 10)); if (fail) throw new Error("locked"); return value.toString(); } });
			await vault.set("account", "first");
			expect(await Promise.all(Array.from({ length: 400 }, () => vault.get("account")))).toEqual(Array(400).fill("first"));
			expect(decryptions).toBe(1);
			await vault.set("account", "second"); expect(await vault.get("account")).toBe("second"); expect(decryptions).toBe(2);
			await vault.set("other", "x"); fail = true;
			await expect(vault.get("other")).rejects.toThrow("locked"); fail = false;
			expect(await vault.get("other")).toBe("x");
			vault.remove("account"); expect(() => vault.get("account")).rejects.toThrow();
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});

	it("fails closed when device encryption is unavailable", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try { const vault = new SecretVault(directory, { available: () => false, encrypt: () => Buffer.alloc(0), decrypt: () => "" }); await expect(vault.set("account", "secret")).rejects.toThrow("unavailable"); }
		finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("waits for an asynchronous availability check, as safeStorage's is from Electron 46", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try {
			let available = false;
			const vault = new SecretVault(directory, { available: async () => { await new Promise(resolve => setTimeout(resolve, 5)); return available; }, encrypt: value => Buffer.from(value), decrypt: value => value.toString() });
			expect(await vault.available()).toBe(false); await expect(vault.set("account", "secret")).rejects.toThrow("unavailable"); await expect(vault.get("account")).rejects.toThrow("unavailable");
			available = true; expect(await vault.available()).toBe(true);
			await vault.set("account", "secret"); expect(await vault.get("account")).toBe("secret");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("persists encrypted bytes and rejects path traversal", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try {
			const vault = new SecretVault(directory, { available: () => true, encrypt: () => Buffer.from("encrypted"), decrypt: () => "secret" });
			await vault.set("account", "secret"); expect(readFileSync(path.join(directory, "account.credential"), "utf8")).toBe("encrypted");
			expect(await vault.get("account")).toBe("secret"); await expect(vault.set("../escape", "secret")).rejects.toThrow("identifier");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("opens only exact trusted OAuth origins", () => {
		expect(isNativeAuthUrl("https://auth.openai.com/authorize?client_id=test")).toBe(true);
		for (const url of ["https://auth.openai.com.evil.test/", "http://auth.openai.com/", "https://user:password@auth.openai.com/", "file:///tmp/auth"]) expect(isNativeAuthUrl(url)).toBe(false);
	});
});
