import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import path from "node:path";

const execute = promisify(execFile);
export async function resolveNativeCommand(name: string, npmEntry?: string | string[]): Promise<{ executable: string; prefix: string[] }> {
	if (process.platform !== "win32") return { executable: name, prefix: [] };
	const { stdout } = await execute("where.exe", [name], { windowsHide: true });
	const paths = stdout.split(/\r?\n/).filter(Boolean);
	const executable = paths.find(value => /\.exe$/i.test(value));
	if (executable) return { executable, prefix: [] };
	if (npmEntry) {
		for (const shim of paths) {
			for (const candidate of Array.isArray(npmEntry) ? npmEntry : [npmEntry]) {
				const entry = path.join(path.dirname(shim), "node_modules", candidate);
				if (existsSync(entry)) return { executable: process.execPath, prefix: [entry] };
			}
		}
	}
	throw new Error(`${name} needs a supported native installation.`);
}

const windowsTargets: Partial<Record<string, string>> = { x64: "x86_64-pc-windows-msvc", arm64: "aarch64-pc-windows-msvc" };
/**
 * npm's Codex launcher (bin/codex.js) starts its bundled codex.exe without hiding the window. Run under
 * Electron, which has no console, that opens a terminal window on Windows, so start the binary directly.
 */
export function directLaunch(command: { executable: string; prefix: string[] }): { executable: string; prefix: string[]; environment?: NodeJS.ProcessEnv } {
	const entry = command.prefix[0], target = windowsTargets[process.arch];
	if (process.platform !== "win32" || !entry || !target || !/[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/i.test(entry)) return command;
	const packageRoot = path.dirname(path.dirname(entry));
	const binary = [path.join(packageRoot, "node_modules", "@openai", `codex-win32-${process.arch}`, "vendor", target, "bin", "codex.exe"), path.join(packageRoot, "vendor", target, "bin", "codex.exe")].find(candidate => existsSync(candidate));
	// The launcher tells Codex which package manager installed it, for its own update hints.
	return binary ? { executable: binary, prefix: command.prefix.slice(1), environment: { CODEX_MANAGED_BY_NPM: "1" } } : command;
}

export async function spawnNative(name: string, args: string[], cwd: string, npmEntry?: string | string[], environment?: NodeJS.ProcessEnv) {
	const command = directLaunch(await resolveNativeCommand(name, npmEntry));
	return spawn(command.executable, [...command.prefix, ...args], {
		cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...command.environment, ...environment },
	});
}
