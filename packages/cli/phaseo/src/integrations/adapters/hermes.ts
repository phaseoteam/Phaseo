import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getIntegrationGatewayCredential } from "../credential.js";
import { isCommandAvailable } from "../files.js";
import type { IntegrationAdapter, IntegrationOptions } from "../types.js";

const BASE_URL = "https://api.phaseo.app/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
const KEYS = ["model.provider", "model.base_url", "model.default"] as const;

type PreviousValue = { present: boolean; value?: unknown };
/** envPath records the resolved .env file so removal cleans the file setup wrote, even if HERMES_HOME changes. */
type HermesState = { version: 1; values: Record<string, PreviousValue>; envPath?: string };

async function readState(options: IntegrationOptions): Promise<HermesState | null> {
	try {
		return JSON.parse(await readFile(statePath(options), "utf8")) as HermesState;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

function statePath(options: IntegrationOptions): string {
	return join(options.homeDir, ".config", "phaseo", "integrations", "hermes.json");
}

function run(args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn("hermes", args, { shell: false, stdio: "pipe" });
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (value) => { stdout += value; });
		child.stderr.on("data", (value) => { stderr += value; });
		child.on("error", reject);
		child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `hermes exited with code ${code}`)));
	});
}

async function get(key: string): Promise<PreviousValue> {
	try {
		const output = (await run(["config", "get", key, "--json"])).trim();
		return { present: true, value: output ? JSON.parse(output) : "" };
	} catch (error) {
		if (error instanceof Error && /not found|not set|unknown|missing/i.test(error.message)) return { present: false };
		throw error;
	}
}

async function set(key: string, value: unknown): Promise<void> {
	await run(["config", "set", key, typeof value === "string" ? value : JSON.stringify(value)]);
}

/** Expands `$VAR`, `${VAR}` (and `%VAR%` on Windows) like Python's os.path.expandvars; unknown variables are left as written. */
function expandVariables(value: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
	const lookup = (name: string, original: string) => env[name] ?? original;
	let expanded = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => lookup(braced ?? bare, match));
	if (platform === "win32") expanded = expanded.replace(/%([^%]+)%/g, (match, name) => lookup(name, match));
	return expanded;
}

/** Resolves Hermes' home the way Hermes does: HERMES_HOME with variables and `~` expanded, else ~/.hermes. */
export function resolveHermesHome(options: IntegrationOptions, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
	const configured = env.HERMES_HOME?.trim();
	if (!configured) return join(options.homeDir, ".hermes");
	const expanded = expandVariables(configured, env, platform);
	const home = expanded === "~" ? options.homeDir : /^~[\/]/.test(expanded) ? join(options.homeDir, expanded.slice(2)) : expanded;
	return resolve(home);
}

export function hermesEnvPath(options: IntegrationOptions, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
	return join(resolveHermesHome(options, env, platform), ".env");
}

const OPENAI_KEY_LINE = /^\s*(?:export\s+)?OPENAI_API_KEY\s*=/;

function envLines(before: string | null): string[] {
	return (before ?? "").split(/\r?\n/).filter((line, index, all) => !(index === all.length - 1 && line === ""));
}

/** Sets OPENAI_API_KEY in Hermes' .env contents, replacing an existing assignment. */
export function renderHermesEnv(before: string | null, key: string): string {
	if (/[\r\n]/.test(key)) throw new Error("Phaseo returned an invalid gateway credential");
	const kept = envLines(before).filter((line) => !OPENAI_KEY_LINE.test(line));
	return `${[...kept, `OPENAI_API_KEY=${key}`].join("\n")}\n`;
}

/** Removes OPENAI_API_KEY from Hermes' .env contents, keeping every other line. */
export function renderHermesEnvWithoutKey(before: string): string {
	const kept = envLines(before).filter((line) => !OPENAI_KEY_LINE.test(line));
	return kept.length ? `${kept.join("\n")}\n` : "";
}

async function lstatIfExists(path: string) {
	try {
		return await lstat(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}

/** Reads the .env file, refusing symlinks and anything that is not a regular file in a real directory. */
async function readEnvFileSafely(path: string): Promise<string | null> {
	const directory = await lstatIfExists(dirname(path));
	if (directory && (directory.isSymbolicLink() || !directory.isDirectory())) {
		throw new Error(`Refusing to use ${dirname(path)}: it is a symbolic link or not a directory`);
	}
	const file = await lstatIfExists(path);
	if (file && (file.isSymbolicLink() || !file.isFile())) {
		throw new Error(`Refusing to write ${path}: it is a symbolic link or not a regular file`);
	}
	return file ? readFile(path, "utf8") : null;
}

/** Replaces the .env file atomically through a new 0600 temporary file in the same directory. */
export async function writeEnvFileSafely(path: string, contents: string): Promise<void> {
	const directory = dirname(path);
	if (!await lstatIfExists(directory)) await mkdir(directory, { recursive: true, mode: 0o700 });
	await readEnvFileSafely(path);
	const temporary = join(directory, `.env.phaseo-${process.pid}-${randomBytes(6).toString("hex")}`);
	try {
		await writeFile(temporary, contents, { mode: 0o600, flag: "wx" });
		await chmod(temporary, 0o600);
		await rename(temporary, path);
	} catch (error) {
		await rm(temporary, { force: true }).catch(() => undefined);
		throw error;
	}
}

/** Writes the key to Hermes' .env file directly, so it never appears in a process argument list. */
export async function writeHermesKey(path: string, key: string): Promise<void> {
	await writeEnvFileSafely(path, renderHermesEnv(await readEnvFileSafely(path), key));
}

export async function removeHermesKey(path: string): Promise<void> {
	const before = await readEnvFileSafely(path);
	if (before === null) return;
	const after = renderHermesEnvWithoutKey(before);
	if (after !== before) await writeEnvFileSafely(path, after);
}

async function restore(state: HermesState, options: IntegrationOptions): Promise<void> {
	for (const key of [...KEYS].reverse()) {
		const previous = state.values[key];
		if (previous?.present) await set(key, previous.value);
		else await run(["config", "unset", key]);
	}
	await removeHermesKey(state.envPath ?? hermesEnvPath(options));
}

export const hermesAdapter: IntegrationAdapter = {
	id: "hermes",
	name: "Hermes Agent",
	setupIsAutomatic: true,
	async inspect(options) {
		const installed = await isCommandAvailable(["hermes", "hermes.exe"]);
		let configured = false;
		try { configured = JSON.parse(await readFile(statePath(options), "utf8")).version === 1; } catch {}
		return {
			id: "hermes",
			name: "Hermes Agent",
			status: configured ? "configured" : installed ? "available" : "not-installed",
			configPath: "~/.hermes/config.yaml and ~/.hermes/.env",
			details: configured ? ["Phaseo custom endpoint configured", "Credential stored by Hermes in ~/.hermes/.env"] : [],
		};
	},
	async planSetup() { return []; },
	async planRemove() { return []; },
	setupInstructions(options) {
		return [`Configure Hermes' custom endpoint with ${options.model ?? DEFAULT_MODEL}.`, "Store the dedicated key in Hermes' supported plaintext ~/.hermes/.env credential file."];
	},
	async applySetup(options) {
		if (!await isCommandAvailable(["hermes", "hermes.exe"])) throw new Error("Hermes Agent is not installed or is not on PATH");
		const managed = await readState(options);
		if (managed) {
			// Already managed (for example after the key expired): write the current key and model
			// settings again, keeping the original restore state.
			await writeHermesKey(managed.envPath ?? hermesEnvPath(options), await getIntegrationGatewayCredential("hermes"));
			await set("model.provider", "custom");
			await set("model.base_url", BASE_URL);
			await set("model.default", options.model ?? DEFAULT_MODEL);
			return;
		}
		const existingKey = await get("OPENAI_API_KEY");
		if (existingKey.present && existingKey.value) throw new Error("Hermes already defines OPENAI_API_KEY; remove it before Phaseo setup so it is not overwritten");
		const values: Record<string, PreviousValue> = {};
		for (const key of KEYS) values[key] = await get(key);
		const state: HermesState = { version: 1, values, envPath: hermesEnvPath(options) };
		const path = statePath(options);
		await mkdir(join(options.homeDir, ".config", "phaseo", "integrations"), { recursive: true });
		await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
		try {
			await writeHermesKey(state.envPath!, await getIntegrationGatewayCredential("hermes"));
			await set("model.provider", "custom");
			await set("model.base_url", BASE_URL);
			await set("model.default", options.model ?? DEFAULT_MODEL);
		} catch (error) {
			await restore(state, options).catch(() => undefined);
			await rm(path, { force: true });
			throw error;
		}
	},
	async applyRemove(options) {
		const path = statePath(options);
		let state: HermesState;
		try { state = JSON.parse(await readFile(path, "utf8")) as HermesState; } catch { return; }
		await restore(state, options);
		await rm(path, { force: true });
	},
	removeInstructions() { return ["Restart active Hermes sessions so they reload the restored configuration."]; },
};
