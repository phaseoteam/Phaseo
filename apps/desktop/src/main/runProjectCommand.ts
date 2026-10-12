import { execFile, spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { resolveProjectPath } from "./projectFiles";

export async function runProjectCommand(root: string, command: string, directory: string, signal?: AbortSignal) {
	const cwd = await resolveProjectPath(root, directory);
	if (signal?.aborted) throw new Error("Command cancelled.");
	if (!command.trim() || command.length > 100000) throw new Error("Invalid command.");
	return new Promise<{ output: string; exitCode: number | null; stopped?: string }>((resolve, reject) => {
		const child = spawn(process.platform === "win32" ? "powershell.exe" : "/bin/sh", process.platform === "win32" ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command] : ["-c", command], { cwd, windowsHide: true, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
		let output = ""; let stopped: string | undefined;
		const kill = (reason: string) => {
			if (stopped) return; stopped = reason;
			if (child.pid && process.platform === "win32") execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
			else if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
		};
		const timeout = setTimeout(() => kill("Command exceeded 60 seconds."), 60000);
		const abort = () => kill("Command cancelled."); signal?.addEventListener("abort", abort, { once: true });
		const decoders = [new StringDecoder("utf8"), new StringDecoder("utf8")];
		[child.stdout, child.stderr].forEach((stream, index) => stream.on("data", (chunk: Buffer) => {
			if (output.length >= 2 * 1024 * 1024) { kill("Command exceeded the output limit."); return; }
			output += decoders[index].write(chunk); if (output.length > 2 * 1024 * 1024) { output = output.slice(0, 2 * 1024 * 1024); kill("Command exceeded the output limit."); }
		}));
		const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener("abort", abort); };
		child.once("error", error => { cleanup(); reject(error); });
		child.once("close", exitCode => { cleanup(); output += decoders.map(decoder => decoder.end()).join(""); resolve({ output, exitCode, ...(stopped ? { stopped } : {}) }); });
		if (signal?.aborted) abort();
	});
}
