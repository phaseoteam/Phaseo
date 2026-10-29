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

const BLANK_LINE = /^[ \t]*$/;
/**
 * python-dotenv ends a full-line comment only at CR or LF, so any other text (quotes, backticks,
 * backslashes, non-ASCII such as the dashes and arrows in Hermes' own .env.example) is safe there.
 */
const FULL_LINE_COMMENT = /^[ \t]*#[^\r\n]*$/;
/** NAME=VALUE where VALUE is unquoted (no spaces, quotes, backslashes or #) or quoted on one line without escapes. */
const ASSIGNMENT_LINE = /^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?:[^'"`\\#\s]*|"[^"\\]*"|'[^'\\]*')[ \t]*(?:#[^'"`\\]*)?$/;

/**
 * Hermes reads .env with python-dotenv, whose rules for quoting, escapes, multiline values and
 * newlines are hard to mirror exactly. Phaseo only edits files with LF or CRLF line endings where
 * every line is a full-line comment, or is blank or a single-line NAME=VALUE assignment in
 * printable ASCII. Returns the 1-based number of the first other line, or null when the whole file
 * is supported. For supported files the line-based edits and the OPENAI_API_KEY check below are exact.
 */
export function firstUnsupportedHermesEnvLine(text: string): number | null {
	const lines = text.split("\n");
	for (const [index, raw] of lines.entries()) {
		// A CR is allowed only as part of CRLF; python-dotenv treats a lone CR as a newline.
		const line = index < lines.length - 1 && raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		const supported = FULL_LINE_COMMENT.test(line) || (/^[\t\x20-\x7e]*$/.test(line) && (BLANK_LINE.test(line) || ASSIGNMENT_LINE.test(line)));
		if (!supported) return index + 1;
	}
	return null;
}

export class HermesEnvQuotingError extends Error {}

function unsupportedReason(line: number): string {
	return `line ${line} is not a blank line, a comment or a single-line NAME=VALUE assignment in plain ASCII, so Phaseo cannot edit the file safely`;
}

function setupQuotingMessage(path: string, line: number): string {
	return `Phaseo will not edit ${path}: ${unsupportedReason(line)}. Add this line to it by hand: ${OPENAI_API_KEY}=<key>. Print the key with \`phaseo integrations credential hermes\`, then run phaseo setup hermes again after simplifying the file, or set Hermes' model settings yourself.`;
}

function removeQuotingMessage(path: string, line: number): string {
	return `Phaseo will not edit ${path}: ${unsupportedReason(line)}. Remove the ${OPENAI_API_KEY} line Phaseo added (and the ${HERMES_BLOCK_START} / ${HERMES_BLOCK_END} markers, if present) by hand, then run phaseo integrations remove hermes again.`;
}

function assertSupported(text: string | null, message: (line: number) => string): void {
	const line = text ? firstUnsupportedHermesEnvLine(text) : null;
	if (line !== null) throw new HermesEnvQuotingError(message(line));
}

/** True when a supported .env text assigns OPENAI_API_KEY (with or without `export`). */
export function hermesEnvDefinesOpenAIKey(text: string): boolean {
	return text.split("\n").some((raw) => ASSIGNMENT_LINE.exec(raw.endsWith("\r") ? raw.slice(0, -1) : raw)?.[1] === OPENAI_API_KEY);
}

/**
 * Writes Phaseo's key as a delimited managed block. An existing block keeps its position and only
 * its key line changes; the exact line an earlier version wrote becomes the block in place; with
 * neither, the block is appended. Position matters because later lines can reference
 * ${OPENAI_API_KEY}. Other lines are never edited.
 */
export function renderHermesEnv(before: string | null, key: string, legacyKey?: string): string {
	if (!/^[A-Za-z0-9_.-]+$/.test(key)) throw new Error("Phaseo returned an invalid gateway credential");
	assertSupported(before, (line) => setupQuotingMessage("Hermes' .env", line));
	const text = before ?? "";
	const outside = withoutLegacyLine(withoutManagedBlock(text), legacyKey);
	if (hermesEnvDefinesOpenAIKey(outside)) {
		throw new Error("Hermes' .env already defines OPENAI_API_KEY outside the Phaseo-managed block; remove it before Phaseo setup so it is not overwritten");
	}
	const lines = text.split("\n");
	const blockStart = lines.findIndex((line) => bareLine(line) === HERMES_BLOCK_START);
	const legacyLine = `${OPENAI_API_KEY}=${legacyKey}`;
	const legacyIndex = legacyKey ? lines.findIndex((line) => bareLine(line) === legacyLine) : -1;
	if (blockStart === -1 && legacyIndex === -1) {
		const separator = text === "" || text.endsWith("\n") ? "" : "\n";
		return `${text}${separator}${HERMES_BLOCK_START}\n${OPENAI_API_KEY}=${key}\n${HERMES_BLOCK_END}\n`;
	}
	const eol = (line: string) => line.endsWith("\r") ? "\r" : "";
	const output: string[] = [];
	let inBlock = false;
	let blockIndex = 0;
	for (const [index, line] of lines.entries()) {
		const bare = bareLine(line);
		if (inBlock) {
			if (bare === HERMES_BLOCK_END) {
				inBlock = false;
				if (blockIndex === 1) output.push(line);
			}
			continue;
		}
		if (bare === HERMES_BLOCK_START) {
			inBlock = true;
			blockIndex += 1;
			// Only the first block is kept, with its markers and line endings unchanged.
			if (blockIndex === 1) output.push(line, `${OPENAI_API_KEY}=${key}${eol(line)}`);
			continue;
		}
		if (legacyKey && bare === legacyLine) {
			if (blockStart === -1 && index === legacyIndex) {
				output.push(`${HERMES_BLOCK_START}${eol(line)}`, `${OPENAI_API_KEY}=${key}${eol(line)}`, `${HERMES_BLOCK_END}${eol(line)}`);
			}
			continue;
		}
		output.push(line);
	}
	return output.join("\n");
}

/** Removes only Phaseo's managed block (and the exact line an earlier version wrote, if known). */
export function renderHermesEnvWithoutKey(before: string, legacyKey?: string): string {
	assertSupported(before, (line) => removeQuotingMessage("Hermes' .env", line));
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
	assertSupported(before, (line) => setupQuotingMessage(path, line));
	await writeEnvFileSafely(path, renderHermesEnv(before, key, legacyKey));
}

/** Refuses up front, before any Hermes setting or Phaseo state changes, if the .env cannot be edited safely. */
export async function assertHermesEnvEditable(path: string, operation: "setup" | "remove"): Promise<void> {
	const before = await readEnvFileSafely(path);
	assertSupported(before, (line) => operation === "setup" ? setupQuotingMessage(path, line) : removeQuotingMessage(path, line));
}

/** Removes Phaseo's block; returns false if an OPENAI_API_KEY written by an earlier version could not be identified. */
export async function removeHermesKey(path: string, legacy?: { key?: string }): Promise<boolean> {
	const before = await readEnvFileSafely(path);
	if (before === null) return true;
	assertSupported(before, (line) => removeQuotingMessage(path, line));
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
