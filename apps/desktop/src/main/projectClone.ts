import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/**
 * A repository address to clone and the folder it clones into, for Clone from a remote URL. Only HTTPS, SSH
 * and `user@host:path` addresses pass: Git's other transports (ext::, file, fd::) can run commands or read local files.
 */
export function cloneSource(value: unknown): { url: string; name: string } {
	const url = typeof value === "string" ? value.trim() : "";
	const valid = url.length <= 2000 && !/[\s\0]/.test(url) && !url.startsWith("-") && (/^https:\/\/[^/@\s]+(?::\d+)?\/.+/i.test(url) || /^ssh:\/\/[^/\s]+\/.+/i.test(url) || /^[\w.-]+@[\w.-]+:[^:\\][^\\]*$/.test(url));
	if (!valid) throw new Error("Paste an HTTPS or SSH address, such as https://github.com/owner/repository.git.");
	const name = url.replace(/[?#].*$/, "").replace(/\/+$/, "").split(/[/:]/).at(-1)!.replace(/\.git$/i, "");
	if (!name || name === "." || name === ".." || /[<>:"|?*\\]/.test(name)) throw new Error("This address does not name a repository.");
	return { url, name };
}

/** Clones into `parent/<name>`. Git never asks for a password here: a private repository needs saved credentials or a key. */
export async function cloneRepository(value: unknown, parent: string, run = execute): Promise<string> {
	const { url, name } = cloneSource(value), directory = path.join(parent, name);
	if (existsSync(directory)) throw new Error(`${directory} already exists. Choose another folder.`);
	try {
		await run("git", ["-c", "protocol.ext.allow=never", "-c", "protocol.file.allow=never", "clone", "--", url, directory], { cwd: parent, windowsHide: true, timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" } });
	} catch (error) {
		const detail = (error as { stderr?: string }).stderr?.trim().split("\n").filter(line => !/^Cloning into/.test(line)).at(-1);
		throw new Error(detail ? `Could not clone ${url}: ${detail.replace(/^fatal: /, "")}` : `Could not clone ${url}.`, { cause: error });
	}
	return directory;
}
