import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export type CredentialEncryption = { available: () => boolean; encrypt: (value: string) => Buffer | Promise<Buffer>; decrypt: (value: Buffer) => string | Promise<string> };
export class SecretVault {
	/**
	 * Decrypted values by credential, with the encrypted bytes they came from. Every chat run reads its account's key,
	 * and on Windows each decryption starts a PowerShell process, so hundreds of chats starting together share one.
	 */
	private readonly decrypted = new Map<string, { encrypted: Buffer; value: Promise<string> }>();
	constructor(private readonly directory: string, private readonly encryption: CredentialEncryption) { mkdirSync(directory, { recursive: true }); }
	available() { return this.encryption.available(); }
	private filename(id: string) {
		if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid credential identifier.");
		return path.join(this.directory, `${id}.credential`);
	}
	async set(id: string, value: string) {
		if (!this.encryption.available()) throw new Error("Secure credential storage is unavailable on this device.");
		const filename = this.filename(id);
		const encrypted = await this.encryption.encrypt(value);
		writeFileSync(`${filename}.tmp`, encrypted, { mode: 0o600 });
		renameSync(`${filename}.tmp`, filename);
		this.decrypted.delete(id);
	}
	async get(id: string) {
		if (!this.encryption.available()) throw new Error("Secure credential storage is unavailable on this device.");
		// The file is read every time, so a credential changed elsewhere is decrypted again.
		const encrypted = readFileSync(this.filename(id)), cached = this.decrypted.get(id);
		if (cached?.encrypted.equals(encrypted)) return cached.value;
		const value = Promise.resolve().then(() => this.encryption.decrypt(encrypted));
		this.decrypted.set(id, { encrypted, value });
		// A failed decryption is not kept, so the next read tries again.
		value.catch(() => { if (this.decrypted.get(id)?.value === value) this.decrypted.delete(id); });
		return value;
	}
	remove(id: string) { this.decrypted.delete(id); rmSync(this.filename(id), { force: true }); }
}
