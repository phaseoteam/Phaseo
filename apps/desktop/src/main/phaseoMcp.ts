import { McpCallBudget } from "./mcpCallBudget";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { respondMcpElicitation } from "./mcpElicitation";
import type { AgentCallbacks } from "./agentAdapter";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHash } from "node:crypto";
import { defineTool, type AgentTool } from "@phaseo/agent-sdk";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import { AgentInputRejectedError } from "./agentAdapter";

export type PhaseoMcpSession = { tools: AgentTool[]; labels: Record<string,string>; close: () => Promise<void> };
export async function connectPhaseoMcp(connections: McpConnection[], cwd: string, signal: AbortSignal, callbacks?: AgentCallbacks): Promise<PhaseoMcpSession> {
 const clients: Client[] = [], tools: AgentTool[] = [];
 const labels: Record<string,string> = {};
 const setupSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
 let closing: Promise<void> | undefined;
 const close = () => closing ??= (async () => { signal.removeEventListener("abort", stop); await Promise.allSettled(clients.map(client => client.close())); })();
 const stop = () => { void close(); };
 signal.addEventListener("abort", stop, { once: true });
 try {
  for (const connection of connections) {
   if (signal.aborted) throw Error("MCP setup cancelled.");
   const client = new Client({ name: "phaseo-desktop", version: "0.1.0" }, { capabilities: callbacks?.onForm ? { elicitation: { form: {}, url: {} } } : {} }); clients.push(client);
   const budgets = new Set<McpCallBudget>(); let waitingForms = 0;
   if (callbacks?.onForm) {
    const formCallbacks = { ...callbacks, onForm: async (...args: Parameters<NonNullable<AgentCallbacks["onForm"]>>) => {
     waitingForms++; for (const budget of budgets) budget.pause();
     try { return await callbacks.onForm!(...args); }
     finally { if (--waitingForms === 0) for (const budget of budgets) budget.resume(); }
    } };
    client.setRequestHandler(ElicitRequestSchema, (request, extra) => respondMcpElicitation({ ...request.params, serverName: connection.name }, formCallbacks, AbortSignal.any([signal, extra.signal])));
   }
   const transport = connection.transport === "stdio"
    ? new StdioClientTransport({ command: connection.executable, args: connection.arguments, cwd, env: { ...getDefaultEnvironment(), ELECTRON_RUN_AS_NODE: "1" }, stderr: "ignore", maxBufferSize: 2 * 1024 * 1024 })
    : new StreamableHTTPClientTransport(new URL(connection.url));
   await client.connect(transport, { signal: setupSignal, timeout: 30000 });
   let cursor: string | undefined; const cursors = new Set<string>(), names = new Set<string>();
   do {
    const page = await client.listTools(cursor ? { cursor } : {}, { signal: setupSignal, timeout: 30000 });
    for (const tool of page.tools) {
     if (!tool.name || tool.name.length > 1000 || names.has(tool.name) || names.size >= 200 || tools.length >= 500 || JSON.stringify(tool.inputSchema).length > 64000) throw Error("MCP tool discovery exceeded its supported limits.");
     names.add(tool.name);
     // Stable names isolate servers and remain valid provider tool identifiers.
     const id = `${nativeMcpName(connection)}_${createHash("sha256").update(tool.name).digest("hex").slice(0,20)}`;
     labels[id] = `${connection.name} · ${tool.name}`;
     tools.push(defineTool({ id, description: `MCP ${connection.name}: ${tool.name}. ${tool.description ?? ""}`.slice(0,4000), parameters: tool.inputSchema, requireApproval: true, onError: "return-to-model",
      async execute(input: unknown, context) {
       if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 1000000) throw Error("Invalid MCP tool arguments.");
       const budget = new McpCallBudget(); budgets.add(budget); if (waitingForms) budget.pause();
       try {
       const result = await client.callTool({ name: tool.name, arguments: input as Record<string,unknown> }, undefined, { signal: AbortSignal.any([signal, ...(context.signal ? [context.signal] : []), budget.signal]), timeout: 2147483647 });
       if (JSON.stringify(result).length > 1000000) throw Error("MCP tool result exceeds the 1 MB limit.");
       if (result.isError) throw Error(`MCP tool returned an error: ${JSON.stringify(result.content).slice(0,5000)}`);
       return result;
       } finally { budgets.delete(budget); budget.dispose(); }
      },
     }));
    }
    cursor = page.nextCursor;
    if (cursor && (!cursor.length || cursor.length > 2048 || cursors.has(cursor))) throw Error("MCP returned an invalid tool-page cursor.");
    if (cursor) cursors.add(cursor);
   } while (cursor);
  }
  if (setupSignal.aborted) throw Error("MCP setup cancelled or timed out.");
  return { tools, labels, close };
 } catch {
  await close();
  throw new AgentInputRejectedError(signal.aborted ? "MCP setup cancelled. Your instruction was not submitted." : "MCP setup failed. Check enabled connections and server access, then retry. Your instruction was not submitted.");
 }
}
