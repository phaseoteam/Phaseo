import { spawn } from "node:child_process";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getIntegrationGatewayCredential } from "../credential.js";
import { isCommandAvailable } from "../files.js";
import type { IntegrationAdapter, IntegrationOptions } from "../types.js";

const BASE_URL = "https://api.phaseo.app/v1";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";
const KEYS = ["model.provider", "model.base_url", "model.default"] as const;

type PreviousValue = { present: boolean; value?: unknown };
type HermesState = { version: 1; values: Record<string, PreviousValue> };

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

export function hermesEnvPath(options: IntegrationOptions, env: NodeJS.ProcessEnv = process.env): string {
	return join(env.HERMES_HOME || join(options.homeDir, ".hermes"), ".env");
}

/** Sets OPENAI_API_KEY in Hermes' .env contents, replacing an existing assignment. */
export function renderHermesEnv(before: string | null, key: string): string {
	if (/[\r\n]/.test(key)) throw new Error("Phaseo returned an invalid gateway credential");
	const lines = (before ?? "").split(/\r?\n/).filter((line, index, all) => !(index === all.length - 1 && line === ""));
	const kept = lines.filter((line) => !/^\s*(?:export\s+)?OPENAI_API_KEY\s*=/.test(line));
	return `${[...kept, `OPENAI_API_KEY=${key}`].join("\n")}\n`;
}

/** Writes the key to Hermes' .env file directly, so it never appears in a process argument list. */
async function writeHermesKey(options: IntegrationOptions, key: string): Promise<void> {
	const path = hermesEnvPath(options);
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const before = await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return null;
		throw error;
	});
	await writeFile(path, renderHermesEnv(before, key), { mode: 0o600 });
	await chmod(path, 0o600);
}

async function restore(state: HermesState): Promise<void> {
	for (const key of [...KEYS].reverse()) {
		const previous = state.values[key];
		if (previous?.present) await set(key, previous.value);
		else await run(["config", "unset", key]);
	}
	await run(["config", "unset", "OPENAI_API_KEY"]);
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
		try { await readFile(statePath(options)); throw new Error("Hermes is already managed by Phaseo CLI; remove it before setting up again"); } catch (error) {
			if (error instanceof Error && !/ENOENT/.test(String((error as NodeJS.ErrnoException).code))) throw error;
		}
		const existingKey = await get("OPENAI_API_KEY");
		if (existingKey.present && existingKey.value) throw new Error("Hermes already defines OPENAI_API_KEY; remove it before Phaseo setup so it is not overwritten");
		const values: Record<string, PreviousValue> = {};
		for (const key of KEYS) values[key] = await get(key);
		const state: HermesState = { version: 1, values };
		const path = statePath(options);
		await mkdir(join(options.homeDir, ".config", "phaseo", "integrations"), { recursive: true });
		await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
		try {
			await writeHermesKey(options, await getIntegrationGatewayCredential("hermes"));
			await set("model.provider", "custom");
			await set("model.base_url", BASE_URL);
			await set("model.default", options.model ?? DEFAULT_MODEL);
		} catch (error) {
			await restore(state).catch(() => undefined);
			await rm(path, { force: true });
			throw error;
		}
	},
	async applyRemove(options) {
		const path = statePath(options);
		let state: HermesState;
		try { state = JSON.parse(await readFile(path, "utf8")) as HermesState; } catch { return; }
		await restore(state);
		await rm(path, { force: true });
	},
	removeInstructions() { return ["Restart active Hermes sessions so they reload the restored configuration."]; },
};
