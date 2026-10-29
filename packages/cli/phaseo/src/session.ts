import { spawn } from "node:child_process";
import { accessSync, constants, realpathSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

async function readKeychainSession(): Promise<Session | null> {
	try {
		const raw = await runCommand(credentialHelperPath("keychain"), [
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

/**
 * `security -i` reads commands from stdin, so the session (hex-encoded with -X) never appears in a
 * process argument list. `-w` with no value prompts on the terminal instead, so it cannot be piped.
 */
export function keychainWriteCommand(session: Session): { args: string[]; input: string } {
	const hex = Buffer.from(JSON.stringify(session), "utf8").toString("hex");
	return {
		args: ["-i"],
		input: `add-generic-password -U -a ${SESSION_ACCOUNT} -s ${SESSION_SERVICE} -X ${hex}\n`,
	};
}

async function writeKeychainSession(session: Session): Promise<void> {
	const command = keychainWriteCommand(session);
	await runCommand(credentialHelperPath("keychain"), command.args, command.input).catch(() => undefined);
	// Interactive mode can exit 0 after a failed command, so confirm the stored value.
	if (JSON.stringify(await readKeychainSession()) === JSON.stringify(session)) return;
	// Fallback for keychain tools that reject the stdin form; this passes the session as an argument.
	await runCommand(credentialHelperPath("keychain"), [
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
	await runCommand(credentialHelperPath("keychain"), [
		"delete-generic-password",
		"-a",
		SESSION_ACCOUNT,
		"-s",
		SESSION_SERVICE,
	]).catch(() => undefined);
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
