import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecretVault } from "./secretVault";
import { isNativeAuthUrl } from "./accountConnections";

describe("credential boundaries", () => {
	it("fails closed when device encryption is unavailable", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try { const vault = new SecretVault(directory, { available: () => false, encrypt: () => Buffer.alloc(0), decrypt: () => "" }); expect(() => vault.set("account", "secret")).toThrow("unavailable"); }
		finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("persists encrypted bytes and rejects path traversal", () => {
		const directory = mkdtempSync(path.join(tmpdir(), "phaseo-vault-"));
		try {
			const vault = new SecretVault(directory, { available: () => true, encrypt: () => Buffer.from("encrypted"), decrypt: () => "secret" });
			vault.set("account", "secret"); expect(readFileSync(path.join(directory, "account.credential"), "utf8")).toBe("encrypted");
			expect(vault.get("account")).toBe("secret"); expect(() => vault.set("../escape", "secret")).toThrow("identifier");
		} finally { rmSync(directory, { recursive: true, force: true }); }
	});
	it("opens only exact trusted OAuth origins", () => {
		expect(isNativeAuthUrl("https://auth.openai.com/authorize?client_id=test")).toBe(true);
		for (const url of ["https://auth.openai.com.evil.test/", "http://auth.openai.com/", "https://user:password@auth.openai.com/", "file:///tmp/auth"]) expect(isNativeAuthUrl(url)).toBe(false);
	});
});
