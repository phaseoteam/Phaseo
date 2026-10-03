import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

export type CredentialEncryption = { available: () => boolean; encrypt: (value: string) => Buffer; decrypt: (value: Buffer) => string };
export class SecretVault {
	constructor(private readonly directory: string, private readonly encryption: CredentialEncryption) { mkdirSync(directory, { recursive: true }); }
	available() { return this.encryption.available(); }
	private filename(id: string) {
		if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid credential identifier.");
		return path.join(this.directory, `${id}.credential`);
	}
	set(id: string, value: string) {
		if (!this.encryption.available()) throw new Error("Secure credential storage is unavailable on this device.");
		const filename = this.filename(id);
		writeFileSync(`${filename}.tmp`, this.encryption.encrypt(value), { mode: 0o600 });
		renameSync(`${filename}.tmp`, filename);
	}
	get(id: string) {
		if (!this.encryption.available()) throw new Error("Secure credential storage is unavailable on this device.");
		return this.encryption.decrypt(readFileSync(this.filename(id)));
	}
	remove(id: string) { rmSync(this.filename(id), { force: true }); }
}
