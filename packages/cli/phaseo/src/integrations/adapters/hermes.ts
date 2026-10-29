import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getIntegrationGatewayCredential } from "../credential.js";
import { readSession } from "../../session.js";
import { isCommandAvailable } from "../files.js";
import type { IntegrationAdapter, IntegrationOptions } from "../types.js";

const BASE_URL = "https://api.phaseo.app/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
const KEYS = ["model.provider", "model.base_url", "model.default"] as const;

type PreviousValue = { present: boolean; value?: unknown };
/** envPath records the resolved .env file so removal cleans the file setup wrote, even if HERMES_HOME changes. */
/** keyFormat "managed-block" marks states whose key is in Phaseo's delimited .env block. */
type HermesState = { version: 1; values: Record<string, PreviousValue>; envPath?: string; keyFormat?: "managed-block" };

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
	const separator = platform === "win32" ? /^~[\\/]/ : /^~\//;
	const home = expanded === "~" ? options.homeDir : separator.test(expanded) ? join(options.homeDir, expanded.slice(2)) : expanded;
	return resolve(home);
}

export function hermesEnvPath(options: IntegrationOptions, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
	return join(resolveHermesHome(options, env, platform), ".env");
}

export const HERMES_BLOCK_START = "# >>> phaseo managed (do not edit)";
export const HERMES_BLOCK_END = "# <<< phaseo managed";
const OPENAI_API_KEY = "OPENAI_API_KEY";

const bareLine = (line: string) => line.replace(/\r$/, "");

/** Removes Phaseo's managed block(s), leaving every other line byte-for-byte. */
function withoutManagedBlock(text: string): string {
	let lines = text.split("\n");
	for (;;) {
		const start = lines.findIndex((line) => bareLine(line) === HERMES_BLOCK_START);
		if (start === -1) return lines.join("\n");
		const end = lines.findIndex((line, index) => index > start && bareLine(line) === HERMES_BLOCK_END);
		if (end === -1) throw new Error("Hermes' .env has an unterminated Phaseo-managed block; fix or remove it by hand, then retry");
		lines = [...lines.slice(0, start), ...lines.slice(end + 1)];
	}
}

/** Removes the exact `OPENAI_API_KEY=<key>` line an earlier Phaseo version wrote, if present. */
function withoutLegacyLine(text: string, legacyKey: string | undefined): string {
	if (!legacyKey) return text;
	return text.split("\n").filter((line) => bareLine(line) !== `${OPENAI_API_KEY}=${legacyKey}`).join("\n");
}

/**
 * True when any line has an odd number of `"` or `'` characters (escapes are not considered) or a
 * backtick. Such files may hold multiline quoted values, so Phaseo does not edit them; every other
 * file has single-line values only, and the line-based edits below are exact.
 */
export function hermesEnvHasComplexQuoting(text: string): boolean {
	return text.split("\n").some((line) => {
		if (line.includes("`")) return true;
		const count = (quote: string) => line.split(quote).length - 1;
		return count("\"") % 2 === 1 || count("'") % 2 === 1;
	});
}

export class HermesEnvQuotingError extends Error {}

const QUOTING_REASON = "it has multiline or complex quoting (a line with an odd number of \" or ' characters, or a backtick)";

function setupQuotingMessage(path: string): string {
	return `Phaseo will not edit ${path}: ${QUOTING_REASON}. Add this line to it by hand: ${OPENAI_API_KEY}=<key>. Print the key with \`phaseo integrations credential hermes\`, then run phaseo setup hermes again after simplifying the file, or set Hermes' model settings yourself.`;
}

function removeQuotingMessage(path: string): string {
	return `Phaseo will not edit ${path}: ${QUOTING_REASON}. Remove the ${OPENAI_API_KEY} line Phaseo added (and the ${HERMES_BLOCK_START} / ${HERMES_BLOCK_END} markers, if present) by hand, then run phaseo integrations remove hermes again.`;
}

/**
 * True when the .env text assigns OPENAI_API_KEY, including `export` and quoted-name forms. Any
 * other line mentioning the name counts as a definition, so unclear cases refuse rather than
 * overwrite. Callers reject files with complex quoting first, so every value is on one line.
 */
export function hermesEnvDefinesOpenAIKey(text: string): boolean {
	for (const raw of text.split("\n")) {
		const line = bareLine(raw);
		if (/^\s*(?:#|$)/.test(line)) continue;
		const match = /^\s*(?:export\s+)?(?:"([^"]*)"|'([^']*)'|([^\s=#"']+))\s*=/.exec(line);
		if (match ? (match[1] ?? match[2] ?? match[3]) === OPENAI_API_KEY : line.includes(OPENAI_API_KEY)) return true;
	}
	return false;
}

/**
 * Writes Phaseo's key as a delimited managed block, replacing only an earlier Phaseo block (or the
 * exact line an earlier version wrote). Other lines are never edited.
 */
export function renderHermesEnv(before: string | null, key: string, legacyKey?: string): string {
	if (!/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error("Phaseo returned an invalid gateway credential");
	if (before && hermesEnvHasComplexQuoting(before)) throw new HermesEnvQuotingError(setupQuotingMessage("Hermes' .env"));
	const outside = withoutLegacyLine(withoutManagedBlock(before ?? ""), legacyKey);
	if (hermesEnvDefinesOpenAIKey(outside)) {
		throw new Error("Hermes' .env already defines OPENAI_API_KEY outside the Phaseo-managed block; remove it before Phaseo setup so it is not overwritten");
	}
	const separator = outside === "" || outside.endsWith("\n") ? "" : "\n";
	return `${outside}${separator}${HERMES_BLOCK_START}\n${OPENAI_API_KEY}=${key}\n${HERMES_BLOCK_END}\n`;
}

/** Removes only Phaseo's managed block (and the exact line an earlier version wrote, if known). */
export function renderHermesEnvWithoutKey(before: string, legacyKey?: string): string {
	if (hermesEnvHasComplexQuoting(before)) throw new HermesEnvQuotingError(removeQuotingMessage("Hermes' .env"));
	return withoutLegacyLine(withoutManagedBlock(before), legacyKey);
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
export async function writeHermesKey(path: string, key: string, legacyKey?: string): Promise<void> {
	const before = await readEnvFileSafely(path);
	if (before && hermesEnvHasComplexQuoting(before)) throw new HermesEnvQuotingError(setupQuotingMessage(path));
	await writeEnvFileSafely(path, renderHermesEnv(before, key, legacyKey));
}

/** Refuses up front, before any Hermes setting or Phaseo state changes, if the .env cannot be edited safely. */
export async function assertHermesEnvEditable(path: string, operation: "setup" | "remove"): Promise<void> {
	const before = await readEnvFileSafely(path);
	if (before && hermesEnvHasComplexQuoting(before)) {
		throw new HermesEnvQuotingError(operation === "setup" ? setupQuotingMessage(path) : removeQuotingMessage(path));
	}
}

/** Removes Phaseo's block; returns false if an OPENAI_API_KEY written by an earlier version could not be identified. */
export async function removeHermesKey(path: string, legacy?: { key?: string }): Promise<boolean> {
	const before = await readEnvFileSafely(path);
	if (before === null) return true;
	if (hermesEnvHasComplexQuoting(before)) throw new HermesEnvQuotingError(removeQuotingMessage(path));
	const after = renderHermesEnvWithoutKey(before, legacy?.key);
	if (after !== before) await writeEnvFileSafely(path, after);
	return !legacy || !hermesEnvDefinesOpenAIKey(after);
}

/** States from before the managed block wrote a bare OPENAI_API_KEY line holding the session's Hermes key. */
async function legacyKeyFor(state: HermesState): Promise<{ key?: string } | undefined> {
	if (state.keyFormat === "managed-block") return undefined;
	return { key: (await readSession())?.integrationGatewayCredentials?.hermes?.key };
}

async function restore(state: HermesState, options: IntegrationOptions): Promise<void> {
	for (const key of [...KEYS].reverse()) {
		const previous = state.values[key];
		if (previous?.present) await set(key, previous.value);
		else await run(["config", "unset", key]);
	}
	const envPath = state.envPath ?? hermesEnvPath(options);
	if (!await removeHermesKey(envPath, await legacyKeyFor(state))) {
		process.stderr.write(`Phaseo could not identify the OPENAI_API_KEY line an earlier Phaseo version wrote to ${envPath}. Remove it by hand if it is no longer needed.\n`);
	}
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
		await assertHermesEnvEditable(managed?.envPath ?? hermesEnvPath(options), "setup");
		if (managed) {
			// Already managed (for example after the key expired): write the current key and model
			// settings again, keeping the original restore state.
			const envPath = managed.envPath ?? hermesEnvPath(options);
			// Read the stored key before getIntegrationGatewayCredential can replace an expired one.
			const legacy = await legacyKeyFor(managed);
			try {
				await writeHermesKey(envPath, await getIntegrationGatewayCredential("hermes"), legacy?.key);
			} catch (error) {
				if (legacy && error instanceof Error && /outside the Phaseo-managed block/.test(error.message)) {
					throw new Error(`${envPath} has an OPENAI_API_KEY line from an earlier Phaseo version that could not be matched to the stored key. Remove that line, then run phaseo setup hermes again.`);
				}
				throw error;
			}
			if (legacy) await writeFile(statePath(options), `${JSON.stringify({ ...managed, envPath, keyFormat: "managed-block" }, null, 2)}\n`, { mode: 0o600 });
			await set("model.provider", "custom");
			await set("model.base_url", BASE_URL);
			await set("model.default", options.model ?? DEFAULT_MODEL);
			return;
		}
		const existingKey = await get("OPENAI_API_KEY");
		if (existingKey.present && existingKey.value) throw new Error("Hermes already defines OPENAI_API_KEY; remove it before Phaseo setup so it is not overwritten");
		const values: Record<string, PreviousValue> = {};
		for (const key of KEYS) values[key] = await get(key);
		const state: HermesState = { version: 1, values, envPath: hermesEnvPath(options), keyFormat: "managed-block" };
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
		await assertHermesEnvEditable(state.envPath ?? hermesEnvPath(options), "remove");
		await restore(state, options);
		await rm(path, { force: true });
	},
	removeInstructions() { return ["Restart active Hermes sessions so they reload the restored configuration."]; },
};
