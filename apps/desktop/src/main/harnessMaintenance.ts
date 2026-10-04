import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Harness } from "../shared/workspace";

export type MaintenanceAction = { executable: string; args: string[] };
type Command = { executable: string; prefix: string[] };
type Lookup = { home: string; searchPath: string };
const packages: Partial<Record<Harness, string[]>> = {
	codex: ["@openai/codex"], claude: ["@anthropic-ai/claude-code"],
	pi: ["@earendil-works/pi-coding-agent", "@mariozechner/pi-coding-agent"],
};
async function manifest(directory: string) {
	const filename = path.join(directory, "package.json");
	if ((await stat(filename)).size > 64 * 1024) throw new Error("Package metadata is too large.");
	return JSON.parse(await readFile(filename, "utf8")) as { name?: string; bin?: string | Record<string, string> };
}
async function absoluteCommand(command: Command, lookup: Lookup) {
	if (command.prefix.length) return realpath(command.prefix[0]);
	if (path.isAbsolute(command.executable)) return realpath(command.executable);
	for (const directory of lookup.searchPath.split(path.delimiter).filter(value => path.isAbsolute(value))) {
		const candidate = path.join(directory, command.executable);
		try { if ((await stat(candidate)).isFile()) { await access(candidate, constants.X_OK); return realpath(candidate); } } catch { /* Continue absolute PATH lookup. */ }
	}
	throw new Error("Harness command is unavailable.");
}
async function npmCommand(lookup: Lookup): Promise<MaintenanceAction | undefined> {
	for (const directory of lookup.searchPath.split(path.delimiter).filter(value => path.isAbsolute(value))) {
		const candidates = process.platform === "win32" ? [path.join(directory, "node_modules/npm/bin/npm-cli.js")]
			: [path.join(directory, "npm"), path.join(directory, "../lib/node_modules/npm/bin/npm-cli.js"), path.join(directory, "../node_modules/npm/bin/npm-cli.js")];
		for (const candidate of candidates) try {
			const target = await realpath(candidate), root = path.resolve(target, "../..");
			if ((await manifest(root)).name === "npm") return { executable: process.execPath, args: [target] };
		} catch { /* Try the next npm installation. */ }
	}
}
export async function resolveHarnessMaintenance(harness: Harness, command: Command, lookup: Lookup = { home: homedir(), searchPath: process.env.PATH ?? "" }): Promise<{ method: "npm" | "native" | "manual"; action?: MaintenanceAction }> {
	let target: string;
	try { target = await absoluteCommand(command, lookup); } catch { return { method: "manual" }; }
	for (const name of packages[harness] ?? []) {
		const marker = `${path.sep}node_modules${path.sep}${name.split("/").join(path.sep)}${path.sep}`;
		const offset = target.lastIndexOf(marker);
		if (offset < 0) continue;
		const root = target.slice(0, offset + marker.length - 1);
		try {
			const metadata = await manifest(root);
			const bin = typeof metadata.bin === "string" ? metadata.bin : metadata.bin?.[harness];
			if (metadata.name !== name || typeof bin !== "string" || await realpath(path.resolve(root, bin)) !== target) continue;
			const prefix = target.slice(0, offset);
			// Global npm packages live directly under prefix/node_modules (Windows)
			// or prefix/lib/node_modules (POSIX); project-local .bin targets stay manual.
			const owner = process.platform === "win32" ? prefix : path.basename(prefix) === "lib" ? path.dirname(prefix) : undefined;
			if (!owner || command.prefix.length > 1 || (process.platform === "win32" && path.dirname(command.prefix[0] ?? command.executable).includes(`${path.sep}.bin`))) continue;
			const launcherDirectory = process.platform === "win32" ? owner : path.join(owner, "bin");
			const samePath = (value: string) => process.platform === "win32" ? path.resolve(value).toLowerCase() === launcherDirectory.toLowerCase() : path.resolve(value) === launcherDirectory;
			let registered = false;
			for (const value of lookup.searchPath.split(path.delimiter).filter(value => path.isAbsolute(value))) {
				try { if (samePath(await realpath(value))) { registered = true; break; } } catch { /* Ignore unavailable PATH directories. */ }
			}
			if (!registered) continue;
			const npm = await npmCommand(lookup);
			return { method: "npm", ...(npm ? { action: { executable: npm.executable, args: [...npm.args, "install", "--global", "--prefix", owner, `--allow-scripts=${name}`, `${name}@latest`] } } : {}) };
		} catch { /* Metadata does not establish ownership. */ }
	}
	if (harness === "claude" && !command.prefix.length) {
		try {
			const home = await realpath(lookup.home), launcher = path.join(home, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude");
			const versions = path.join(home, ".local", "share", "claude", "versions") + path.sep;
			const claimed = path.isAbsolute(command.executable) ? path.join(await realpath(path.dirname(command.executable)), path.basename(command.executable)) : command.executable;
			const equal = (a: string, b: string) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
			if ((equal(claimed, launcher) || command.executable === "claude") && (equal(target, launcher) || target.startsWith(versions))) return { method: "native", action: { executable: target, args: ["update"] } };
		} catch { /* Native profile ownership could not be established. */ }
	}
	return { method: "manual" };
}
