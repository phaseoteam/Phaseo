import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecretVault } from "./secretVault";
import { isNativeAuthUrl } from "./accountConnections";

describe("credential boundaries", () => {
	it("fails closed when device encryption is unavailable", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try { const vault = new SecretVault(directory, { available: () => false, encrypt: () => Buffer.alloc(0), decrypt: () => "" }); await expect(vault.set("account", "secret")).rejects.toThrow("unavailable"); }
		finally { rmSync(directory, { recursive: true, force: true }); }
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
