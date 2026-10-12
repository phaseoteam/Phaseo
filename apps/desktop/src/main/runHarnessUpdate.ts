import { execFile, spawn } from "node:child_process";
import type { MaintenanceAction } from "./harnessMaintenance";

export async function runHarnessUpdate(action: MaintenanceAction, cwd: string, signal: AbortSignal): Promise<void> {
	if (signal.aborted) throw new Error("Harness update cancelled.");
	const environment = { ...process.env, ELECTRON_RUN_AS_NODE: "1" } as NodeJS.ProcessEnv;
	delete environment.NODE_OPTIONS; delete environment.NODE_PATH;
	await new Promise<void>((resolve, reject) => {
		const child = spawn(action.executable, action.args, { cwd, env: environment, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
		let stopped: string | undefined, bytes = 0;
		const stop = (message: string) => {
			if (stopped) return; stopped = message;
			if (child.pid && process.platform === "win32" && child.exitCode === null) execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5_000 }, error => { if (error) child.kill(); });
			else if (child.pid && process.platform !== "win32") { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
			else { child.stdout.destroy(); child.stderr.destroy(); }
		};
		const abort = () => stop("Harness update cancelled. Refresh to check the installed version.");
		const timer = setTimeout(() => stop("Harness update timed out. Refresh to check the installed version."), 3 * 60_000);
		const cleanup = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
		signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
		for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) stop("Harness update exceeded its output limit. Refresh to check the installed version."); });
		child.once("error", () => { cleanup(); reject(new Error("Could not start the harness updater.")); });
		child.once("close", code => { cleanup(); if (stopped || code !== 0) reject(new Error(stopped ?? "Harness update failed. Check your installation and try again.")); else resolve(); });
	});
}
