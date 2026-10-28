import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { AgentConnection, AgentStatus } from "../shared/workspace";

export async function checkAcpAgent(agent: AgentConnection, cwd: string, signal: AbortSignal = AbortSignal.timeout(30000)): Promise<AgentStatus> {
	if (signal.aborted) throw new Error("Agent check cancelled.");
	const child = spawn(agent.executable, agent.arguments, { cwd, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } }); child.stderr.resume();
	const connection = client({ name: "phaseo-desktop" }).connect(ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>));
	const abort = () => { connection.close(new Error("Agent check cancelled.")); child.kill(); };
	signal.addEventListener("abort", abort, { once: true });
	child.once("error", () => connection.close(new Error("The agent command could not start."))); child.once("exit", () => connection.close(new Error("The agent stopped during its connection check.")));
	try {
		const result = await connection.agent.request("initialize", { protocolVersion: PROTOCOL_VERSION, clientInfo: { name: "phaseo-desktop", version: "0.1.0" }, clientCapabilities: {} });
		if (result.protocolVersion !== PROTOCOL_VERSION) throw new Error("This agent uses an unsupported ACP protocol version.");
		const caps = result.agentCapabilities; const capabilities: string[] = [];
		if (caps?.loadSession) capabilities.push("Session loading");
		if (caps?.sessionCapabilities?.fork) capabilities.push("Native forks");
		if (caps?.sessionCapabilities?.resume) capabilities.push("Session resume");
		if (caps?.promptCapabilities?.image) capabilities.push("Image input");
		if (caps?.promptCapabilities?.audio) capabilities.push("Audio input");
		if (caps?.promptCapabilities?.embeddedContext) capabilities.push("Embedded context");
		if (caps?.mcpCapabilities?.http) capabilities.push("HTTP MCP");
		if (caps?.mcpCapabilities?.sse) capabilities.push("SSE MCP");
		const label = (value: unknown) => typeof value === "string" ? value.slice(0, 500) : undefined;
		return { checkedAt: new Date().toISOString(), protocolVersion: result.protocolVersion, name: label(result.agentInfo?.name), version: label(result.agentInfo?.version), capabilities, authMethods: (result.authMethods ?? []).slice(0, 100).map(method => label(method.name) ?? "Native sign-in") };
	} finally { signal.removeEventListener("abort", abort); connection.close(); child.kill(); }
}
