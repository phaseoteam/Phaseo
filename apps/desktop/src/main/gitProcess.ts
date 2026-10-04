import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
export async function git(root: string, args: string[]) {
	return (await execute("git", ["--no-pager", ...args], { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024 })).stdout;
}
