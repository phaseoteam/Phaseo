import { mkdir, readFile, writeFile, chmod, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export type Session = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	apiUrl: string;
	scope?: string;
};

function configDir(): string {
	return process.env.AI_STATS_CONFIG_DIR || join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "aistats");
}

export function sessionPath(): string {
	return join(configDir(), "session.json");
}

export async function readSession(): Promise<Session | null> {
	try {
		const raw = await readFile(sessionPath(), "utf8");
		const parsed = JSON.parse(raw) as Partial<Session>;
		if (!parsed.accessToken || !parsed.refreshToken || !parsed.expiresAt || !parsed.apiUrl) return null;
		return parsed as Session;
	} catch {
		return null;
	}
}

export async function writeSession(session: Session): Promise<void> {
	const file = sessionPath();
	await mkdir(dirname(file), { recursive: true, mode: 0o700 });
	await writeFile(file, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
	await chmod(file, 0o600).catch(() => undefined);
}

export async function clearSession(): Promise<void> {
	await rm(sessionPath(), { force: true }).catch(() => undefined);
}
