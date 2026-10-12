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

export async function spawnNative(name: string, args: string[], cwd: string, npmEntry?: string | string[], environment?: NodeJS.ProcessEnv) {
	const command = await resolveNativeCommand(name, npmEntry);
	return spawn(command.executable, [...command.prefix, ...args], {
		cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...environment },
	});
}
