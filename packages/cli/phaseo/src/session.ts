import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform as currentPlatform } from "node:os";
import { dirname, join } from "node:path";

export type Session = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	apiUrl: string;
	scope?: string;
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
		return "file";
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
		if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt || !parsed.apiUrl) return null;
		return parsed as Session;
	} catch {
		return null;
	}
}

async function runCommand(file: string, args: string[], input?: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(file, args, { stdio: "pipe" });
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
	await chmod(file, 0o600).catch(() => undefined);
}

async function clearSessionFile(): Promise<void> {
	await rm(sessionPath(), { force: true }).catch(() => undefined);
}

async function readDpapiSession(): Promise<Session | null> {
	try {
		const base64 = (await readFile(secureSessionPath(), "utf8")).trim();
		if (!base64) return null;
		const raw = await runCommand(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$base64 = [Console]::In.ReadToEnd().Trim(); if (-not $base64) { exit 1 }; $bytes = [Convert]::FromBase64String($base64); $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Console]::Write([System.Text.Encoding]::UTF8.GetString($plain))",
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
		"powershell.exe",
		[
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			"$text = [Console]::In.ReadToEnd(); $bytes = [System.Text.Encoding]::UTF8.GetBytes($text); $protected = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write([Convert]::ToBase64String($protected))",
		],
		payload,
	);
	await writeFile(file, `${protectedPayload.trim()}\n`, { mode: 0o600 });
	await chmod(file, 0o600).catch(() => undefined);
}

async function clearDpapiSession(): Promise<void> {
	await rm(secureSessionPath(), { force: true }).catch(() => undefined);
}

async function readKeychainSession(): Promise<Session | null> {
	try {
		const raw = await runCommand("security", [
			"find-generic-password",
			"-a",
			SESSION_ACCOUNT,
			"-s",
			SESSION_SERVICE,
			"-w",
		]);
		return parseSession(raw);
	} catch {
		return null;
	}
}

async function writeKeychainSession(session: Session): Promise<void> {
	await runCommand("security", [
		"add-generic-password",
		"-U",
		"-a",
		SESSION_ACCOUNT,
		"-s",
		SESSION_SERVICE,
		"-w",
		JSON.stringify(session),
	]);
}

async function clearKeychainSession(): Promise<void> {
	await runCommand("security", [
		"delete-generic-password",
		"-a",
		SESSION_ACCOUNT,
		"-s",
		SESSION_SERVICE,
	]).catch(() => undefined);
}

async function readSecretServiceSession(): Promise<Session | null> {
	try {
		const raw = await runCommand("secret-tool", [
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
		"secret-tool",
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
	await runCommand("secret-tool", [
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
