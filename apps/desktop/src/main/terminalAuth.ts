import type { AgentConnection, TerminalSession } from "../shared/workspace";

export type TerminalAuthRequest = { agent: AgentConnection; args: string[]; env: Record<string, string>; title: string; cwd: string; taskId: string; projectId?: string };
export type TerminalAuthentication = { session: TerminalSession; completed: Promise<void> };

export function validateTerminalAuth(request: TerminalAuthRequest) {
	if (request.args.length > 100 || request.args.some(value => typeof value !== "string" || value.length > 10000 || value.includes("\0"))) throw new Error("Invalid native sign-in arguments.");
	if (Object.keys(request.env).length > 100 || Object.entries(request.env).some(([key, value]) => !key || key.length > 200 || key.includes("=") || key.includes("\0") || typeof value !== "string" || value.length > 10000 || value.includes("\0"))) throw new Error("Invalid native sign-in environment.");
}
