import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, platform as currentPlatform } from "node:os";
import { delimiter, dirname, isAbsolute, join, win32 } from "node:path";

export type Session = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	apiUrl: string;
	scope?: string;
	integrationGatewayKey?: string;
	integrationGatewayKeyId?: string;
	integrationGatewayKeyExpiresAt?: number;
	integrationGatewayCredentials?: Record<string, { key: string; keyId: string; expiresAt?: number }>;
};

type SessionBackend = "dpapi-file" | "keychain" | "secret-service" | "file" | "unavailable";

const SESSION_SERVICE = "phaseo-cli-session";
const SESSION_ACCOUNT = "default";

function configDir(): string {
	return process.env.PHASEO_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "phaseo");
}

export function configDirPath(): string {
	return configDir();
}

export function sessionPath(): string {
	return join(configDir(), "session.json");
}

function secureSessionPath(): string {
	return join(configDir(), "session.secure");
}

export function credentialHelperPath(
	backend: "dpapi-file" | "keychain" | "secret-service",
	env: NodeJS.ProcessEnv = process.env,
): string {
	if (backend === "keychain") return "/usr/bin/security";
	if (backend === "secret-service") {
		const candidates = ["/usr/bin/secret-tool", "/usr/local/bin/secret-tool"];
		for (const directory of (env.PATH ?? "").split(delimiter)) {
			if (directory && isAbsolute(directory)) candidates.push(join(directory, "secret-tool"));
		}
		for (const candidate of candidates) {
			try {
				accessSync(candidate, constants.X_OK);
				return realpathSync(candidate);
			} catch {
				// Continue until an installed executable is found.
			}
		}
		throw new Error("secret-tool is unavailable");
	}
	const systemRoot = env.SystemRoot || env.WINDIR;
	if (!systemRoot) throw new Error("Windows system root is unavailable");
	return win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export function preferredSessionBackend(
	env: NodeJS.ProcessEnv = process.env,
	platform = currentPlatform(),
): SessionBackend {
	const override = env.PHASEO_SESSION_BACKEND?.trim().toLowerCase();
	if (override === "file") return "file";
	if (override === "os") {
		if (platform === "win32") return "dpapi-file";
		if (platform === "darwin") return "keychain";
		if (platform === "linux") return "secret-service";
		return "unavailable";
	}
	if (platform === "win32") return "dpapi-file";
	if (platform === "darwin") return "keychain";
	if (platform === "linux") return "secret-service";
	return "unavailable";
}

function storageError(backend: SessionBackend, cause?: unknown): Error {
	const detail = cause instanceof Error && cause.message ? ` (${cause.message})` : "";
	if (backend === "unavailable") {
		return new Error(
			"No OS-backed credential store is available on this platform. Set PHASEO_SESSION_BACKEND=file only if you explicitly accept plaintext session storage.",
		);
	}
	return new Error(
		`Unable to store the Phaseo session in the OS credential store${detail}. Fix the credential-store service and retry. Set PHASEO_SESSION_BACKEND=file only if you explicitly accept plaintext session storage.`,
	);
}

function parseSession(raw: string): Session | null {
	try {
		const parsed = JSON.parse(raw) as Partial<Session>;
		if (
			typeof parsed.accessToken !== "string" ||
			!parsed.accessToken ||
			typeof parsed.refreshToken !== "string" ||
			!parsed.refreshToken ||
			typeof parsed.expiresAt !== "number" ||
			!Number.isFinite(parsed.expiresAt) ||
			parsed.expiresAt <= 0 ||
			typeof parsed.apiUrl !== "string" ||
			!parsed.apiUrl
		) return null;
		if (parsed.scope !== undefined && typeof parsed.scope !== "string") return null;
		if (parsed.integrationGatewayCredentials !== undefined) {
			if (!parsed.integrationGatewayCredentials || typeof parsed.integrationGatewayCredentials !== "object" || Array.isArray(parsed.integrationGatewayCredentials)) return null;
			for (const value of Object.values(parsed.integrationGatewayCredentials)) {
				if (!value || typeof value !== "object" || typeof value.key !== "string" || !value.key || typeof value.keyId !== "string" || !value.keyId) return null;
				if (value.expiresAt !== undefined && (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt))) return null;
			}
		}
		const integrationFields = [
			parsed.integrationGatewayKey,
			parsed.integrationGatewayKeyId,
			parsed.integrationGatewayKeyExpiresAt,
		];
		if (
			integrationFields.some((value) => value !== undefined) &&
			(
				typeof parsed.integrationGatewayKey !== "string" ||
				!parsed.integrationGatewayKey ||
				typeof parsed.integrationGatewayKeyId !== "string" ||
				!parsed.integrationGatewayKeyId ||
				typeof parsed.integrationGatewayKeyExpiresAt !== "number" ||
				!Number.isFinite(parsed.integrationGatewayKeyExpiresAt)
			)
		) return null;
		return parsed as Session;
	} catch {
		return null;
	}
}

export async function runCommand(file: string, args: string[], input?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(file, args, { stdio: "pipe" });
		// A helper that exits before reading stdin raises EPIPE here; the exit code reports the failure.
		child.stdin.on("error", () => undefined);
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code === 0) {
				resolve(stdout);
				return;
			}
			reject(new Error(stderr.trim() || `${file} exited with code ${code}`));
		});
		if (typeof input === "string") {
			child.stdin.write(input);
		}
		child.stdin.end();
	});
}

async function readSessionFile(): Promise<Session | null> {
	try {
		const raw = await readFile(sessionPath(), "utf8");
		return parseSession(raw);
	} catch {
		return null;
	}
}

async function writeSessionFile(session: Session): Promise<void> {
	const file = sessionPath();
	await mkdir(dirname(file), { recursive: true, mode: 0o700 });
	await writeFile(file, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
	await chmod(file, 0o600);
}

async function clearSessionFile(): Promise<void> {
	await rm(sessionPath(), { force: true }).catch(() => undefined);
}

async function readDpapiSession(): Promise<Session | null> {
	try {
		const base64 = (await readFile(secureSessionPath(), "utf8")).trim();
		if (!base64) return null;
		const raw = await runCommand(
			credentialHelperPath("dpapi-file"),
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"Add-Type -AssemblyName System.Security; $base64 = [Console]::In.ReadToEnd().Trim(); if (-not $base64) { exit 1 }; $bytes = [Convert]::FromBase64String($base64); $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Write([System.Text.Encoding]::UTF8.GetString($plain))",
			],
			base64,
		);
		return parseSession(raw);
	} catch {
		return null;
	}
}

async function writeDpapiSession(session: Session): Promise<void> {
	const file = secureSessionPath();
	await mkdir(dirname(file), { recursive: true, mode: 0o700 });
	const payload = JSON.stringify(session);
	const protectedPayload = await runCommand(
		credentialHelperPath("dpapi-file"),
		[
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"Add-Type -AssemblyName System.Security; $text = [Console]::In.ReadToEnd(); $bytes = [System.Text.Encoding]::UTF8.GetBytes($text); $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($protected))",
		],
		payload,
	);
	await writeFile(file, `${protectedPayload.trim()}\n`, { mode: 0o600 });
	await chmod(file, 0o600);
}

async function clearDpapiSession(): Promise<void> {
	await rm(secureSessionPath(), { force: true }).catch(() => undefined);
}

const SESSION_KEY_SERVICE = "phaseo-cli-session-key";
const KEYCHAIN_FILE_AAD = Buffer.from("phaseo-cli-session-v1");
const GCM_NONCE_BYTES = 12;
const GCM_TAG_BYTES = 16;

export type SecurityCommand = (args: string[], input?: string) => Promise<string>;

function keychainSessionPath(): string {
	return join(configDir(), "session.keychain.enc");
}

/**
 * `security -i` reads commands from stdin, so the value (hex-encoded with -X) never appears in a
 * process argument list. Interactive input is capped at 4096 bytes, so only a 32-byte data key is
 * stored this way; the session itself is encrypted with that key in a local file.
 */
export function keychainAddCommand(service: string, value: string): { args: string[]; input: string } {
	return {
		args: ["-i"],
		input: `add-generic-password -U -a ${SESSION_ACCOUNT} -s ${service} -X ${Buffer.from(value, "utf8").toString("hex")}\n`,
	};
}

export function encryptSessionPayload(session: Session, key: Buffer): string {
	const iv = randomBytes(GCM_NONCE_BYTES);
	const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
	cipher.setAAD(KEYCHAIN_FILE_AAD);
	const data = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
	return `${JSON.stringify({ version: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") })}\n`;
}

export function decryptSessionPayload(payload: string, key: Buffer): Session | null {
	try {
		const parsed = JSON.parse(payload) as { version?: unknown; iv?: unknown; tag?: unknown; data?: unknown };
		if (parsed.version !== 1 || typeof parsed.iv !== "string" || typeof parsed.tag !== "string" || typeof parsed.data !== "string") return null;
		const iv = Buffer.from(parsed.iv, "base64");
		const tag = Buffer.from(parsed.tag, "base64");
		// GCM accepts truncated tags unless the length is pinned, which weakens authentication.
		if (iv.length !== GCM_NONCE_BYTES || tag.length !== GCM_TAG_BYTES) return null;
		const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
		decipher.setAAD(KEYCHAIN_FILE_AAD);
		decipher.setAuthTag(tag);
		const plain = Buffer.concat([decipher.update(Buffer.from(parsed.data, "base64")), decipher.final()]);
		return parseSession(plain.toString("utf8"));
	} catch {
		return null;
	}
}

async function writePrivateFileAtomically(file: string, contents: string): Promise<void> {
	await mkdir(dirname(file), { recursive: true, mode: 0o700 });
	const temporary = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
	try {
		await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
		await chmod(temporary, 0o600);
		await rename(temporary, file);
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => undefined);
		throw error;
	}
}

/**
 * macOS session storage: a random 32-byte data key in the Keychain and the session in a 0600 file
 * encrypted with AES-256-GCM. Sessions stored whole in the Keychain by older versions are migrated
 * on first read.
 */
export function createKeychainSessionStore(security: SecurityCommand) {
	const find = async (service: string) => security(["find-generic-password", "-a", SESSION_ACCOUNT, "-s", service, "-w"]).then((value) => value.trim(), () => null);
	const remove = (service: string) => security(["delete-generic-password", "-a", SESSION_ACCOUNT, "-s", service]).then(() => undefined, () => undefined);
	const readKey = async (): Promise<Buffer | null> => {
		const value = await find(SESSION_KEY_SERVICE);
		return value && /^[0-9a-f]{64}$/.test(value) ? Buffer.from(value, "hex") : null;
	};
	const createKey = async (): Promise<Buffer> => {
		const value = randomBytes(32).toString("hex");
		const command = keychainAddCommand(SESSION_KEY_SERVICE, value);
		await security(command.args, command.input).catch(() => undefined);
		// Interactive mode can exit 0 after a failed command, so confirm the stored value.
		const stored = await readKey();
		if (!stored || stored.toString("hex") !== value) throw new Error("the macOS Keychain did not store the session key");
		return stored;
	};
	const write = async (session: Session): Promise<void> => {
		const key = await readKey() ?? await createKey();
		await writePrivateFileAtomically(keychainSessionPath(), encryptSessionPayload(session, key));
	};
	return {
		write,
		async read(): Promise<Session | null> {
			const key = await readKey();
			if (key) {
				const payload = await readFile(keychainSessionPath(), "utf8").catch(() => null);
				if (payload !== null) return decryptSessionPayload(payload, key);
			}
			const legacy = await find(SESSION_SERVICE);
			const session = legacy ? parseSession(legacy) : null;
			if (session) {
				const migrated = await write(session).then(() => true, () => false);
				if (migrated) await remove(SESSION_SERVICE);
			}
			return session;
		},
		async clear(): Promise<void> {
			await rm(keychainSessionPath(), { force: true }).catch(() => undefined);
			await remove(SESSION_KEY_SERVICE);
			await remove(SESSION_SERVICE);
		},
	};
}

function keychainStore() {
	return createKeychainSessionStore((args, input) => runCommand(credentialHelperPath("keychain"), args, input));
}

async function readKeychainSession(): Promise<Session | null> {
	return keychainStore().read();
}

async function writeKeychainSession(session: Session): Promise<void> {
	await keychainStore().write(session);
}

async function clearKeychainSession(): Promise<void> {
	await keychainStore().clear();
}

async function readSecretServiceSession(): Promise<Session | null> {
	try {
		const raw = await runCommand(credentialHelperPath("secret-service"), [
			"lookup",
			"service",
			SESSION_SERVICE,
			"account",
			SESSION_ACCOUNT,
		]);
		return parseSession(raw);
	} catch {
		return null;
	}
}

async function writeSecretServiceSession(session: Session): Promise<void> {
	await runCommand(
		credentialHelperPath("secret-service"),
		[
			"store",
			"--label=Phaseo CLI session",
			"service",
			SESSION_SERVICE,
			"account",
			SESSION_ACCOUNT,
		],
		JSON.stringify(session),
	);
}

async function clearSecretServiceSession(): Promise<void> {
	await runCommand(credentialHelperPath("secret-service"), [
		"clear",
		"service",
		SESSION_SERVICE,
		"account",
		SESSION_ACCOUNT,
	]).catch(() => undefined);
}

export async function readSession(): Promise<Session | null> {
	const backend = preferredSessionBackend();
	if (backend === "dpapi-file") {
		return readDpapiSession();
	}
	if (backend === "keychain") {
		return readKeychainSession();
	}
	if (backend === "secret-service") {
		return readSecretServiceSession();
	}
	return backend === "file" ? readSessionFile() : null;
}

export async function writeSession(session: Session): Promise<void> {
	const backend = preferredSessionBackend();
	try {
		if (backend === "dpapi-file") {
			await writeDpapiSession(session);
			await clearSessionFile();
			return;
		}
		if (backend === "keychain") {
			await writeKeychainSession(session);
			await clearSessionFile();
			return;
		}
		if (backend === "secret-service") {
			await writeSecretServiceSession(session);
			await clearSessionFile();
			return;
		}
		if (backend === "file") {
			await writeSessionFile(session);
			return;
		}
	} catch (error) {
		throw storageError(backend, error);
	}
	throw storageError(backend);
}

export async function clearSession(): Promise<void> {
	const backend = preferredSessionBackend();
	if (backend === "dpapi-file") {
		await clearDpapiSession();
	} else if (backend === "keychain") {
		await clearKeychainSession();
	} else if (backend === "secret-service") {
		await clearSecretServiceSession();
	}
	await clearSessionFile();
}
