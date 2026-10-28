import { execFile, type ChildProcess } from "node:child_process";

/** Ends an agent and everything it started: on Windows a plain kill leaves its shells running. */
export function killTree(child: ChildProcess | undefined) {
	if (child?.pid && process.platform === "win32") execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => undefined);
	else child?.kill();
}
