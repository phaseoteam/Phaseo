import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Task } from "../shared/workspace";
import { resolveNativeCommand } from "./nativeProcess";
import { AgentInputRejectedError } from "./agentAdapter";

export async function resolveGrokCommand() {
	// Official npm installation places a native binary here. Launch it directly
	// rather than a Node bootstrap process whose child would outlive cancellation.
	const native = path.join(process.env.GROK_HOME ?? path.join(homedir(), ".grok"), "bin", process.platform === "win32" ? "grok.exe" : "grok");
	if (existsSync(native)) return { executable: native, prefix: [] as string[] };
	return resolveNativeCommand("grok");
}
export function grokLaunchArgs(mode: Task["mode"]): string[] {
	if (mode === "chat") throw new AgentInputRejectedError("Grok Chat mode is not connected yet. Use Plan or Code while tool isolation is verified.");
	return ["--no-auto-update", "--permission-mode", mode === "plan" ? "plan" : "default", "agent", "--no-leader", "stdio"];
}
