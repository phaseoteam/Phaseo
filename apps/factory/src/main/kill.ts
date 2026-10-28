import { execFile, type ChildProcess } from "node:child_process";

/**
 * Spawn options that let `killTree` end everything an agent starts. Off Windows the agent leads its own process
 * group, so the shell it runs in and whatever it starts can be signalled together.
 */
export const OWN_GROUP = process.platform === "win32" ? {} : { detached: true };

/** How long an agent gets to stop after SIGTERM before its group gets SIGKILL. */
const GRACE = 5_000;

/** Ends an agent and everything it started: a plain kill leaves its shells and their children running. */
export function killTree(child: ChildProcess | undefined) {
	const pid = child?.pid;
	if (!pid) return;
	if (process.platform === "win32") {
		execFile("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true }, () => undefined);
		return;
	}
	if (!signalGroup(pid, "SIGTERM")) {
		child.kill();
		return;
	}
	// Whatever ignores SIGTERM, or outlives the shell, gets SIGKILL.
	setTimeout(() => signalGroup(pid, "SIGKILL"), GRACE).unref();
}

/** Signals the process group `pid` leads; false when there's no such group (it already ended, or wasn't one). */
function signalGroup(pid: number, signal: NodeJS.Signals) {
	try {
		process.kill(-pid, signal);
		return true;
	} catch {
		return false;
	}
}
