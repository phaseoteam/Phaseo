import { closeMcpClient } from "./closeMcpClient";
import { McpCallBudget } from "./mcpCallBudget";
import { ElicitRequestSchema, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { respondMcpElicitation } from "./mcpElicitation";
import type { AgentCallbacks } from "./agentAdapter";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createHash } from "node:crypto";
import { defineTool, type AgentTool } from "@phaseo/agent-sdk";
import { nativeMcpName, type McpConnection } from "../shared/mcp";
import { AgentInputRejectedError } from "./agentAdapter";
import { phaseoMcpResourceTools } from "./phaseoMcpResources";
import { phaseoMcpPromptTools } from "./phaseoMcpPrompts";
import { span } from "./diagnostics/tracer";

type PromptServer = { id: string; name: string; projectId?: string; list: ReturnType<typeof phaseoMcpPromptTools>["list"]; get: ReturnType<typeof phaseoMcpPromptTools>["get"] };
export type PhaseoMcpSession = { tools: AgentTool[]; labels: Record<string,string>; promptServers: PromptServer[]; close: () => Promise<void> };
/** A connected server and what it offers. Forms it asks for go to whichever turn is using it now. */
type Server = { connection: McpConnection; client: Client; http?: StreamableHTTPClientTransport; tools: Tool[]; prompts: boolean; resources: boolean; budgets: Set<McpCallBudget>; waitingForms: number; turn: { callbacks?: AgentCallbacks; signal: AbortSignal } };
/** Servers kept between a chat's turns, so each message does not start them again. */
type Pooled = { connectionId: string; server: Promise<Server>; leases: number; idle?: ReturnType<typeof setTimeout>; broken: boolean };
const pool = new Map<string, Pooled>();
/** How long an unused server stays up; 0 closes it as soon as its last turn ends. */
export const phaseoMcpPool = { idleMs: 5 * 60_000 };

/** With an owner (the chat's id), servers are reused across its turns and one that fails is left out instead of blocking the message. */
export function connectPhaseoMcp(connections: McpConnection[], cwd: string, signal: AbortSignal, callbacks?: AgentCallbacks, owner?: string): Promise<PhaseoMcpSession> {
 return connections.length ? span("mcp.connect", { servers: connections.length, pooled: Boolean(owner) }, () => connectServers(connections, cwd, signal, callbacks, owner)) : connectServers(connections, cwd, signal, callbacks, owner);
}

/** Closes the pooled servers for a connection whose settings changed; ones in use close when their turn ends. */
export async function closePhaseoMcpConnection(connectionId: string) {
 const entries = [...pool.entries()].filter(([, entry]) => entry.connectionId === connectionId);
 for (const [key, entry] of entries) { pool.delete(key); entry.broken = true; }
 await Promise.allSettled(entries.filter(([, entry]) => entry.leases <= 0).map(async ([, entry]) => { clearTimeout(entry.idle); await disconnect(await entry.server); }));
}

/** Closes every pooled server, for quitting the app. */
export async function closePhaseoMcpPool() {
 const entries = [...pool.values()]; pool.clear();
 await Promise.allSettled(entries.map(async entry => { clearTimeout(entry.idle); await disconnect(await entry.server); }));
}

function disconnect(server: Server, callbacks?: AgentCallbacks) {
 return closeMcpClient(server.client, server.http ? () => server.http!.terminateSession() : undefined, () => callbacks?.onActivity?.({ id: `mcp-cleanup:${server.connection.id}`, type: "tool", title: `${server.connection.name}: session cleanup`, text: "Could not confirm server session cleanup.", status: "failed" }));
}

async function startServer(connection: McpConnection, cwd: string, setupSignal: AbortSignal, turn: Server["turn"], track: (client: Client) => void): Promise<Server> {
 const elicit = Boolean(turn.callbacks?.onForm);
 const client = new Client({ name: "phaseo-desktop", version: "0.1.0" }, { capabilities: elicit ? { elicitation: { form: {}, url: {} } } : {} }); track(client);
 const server: Server = { connection, client, tools: [], prompts: false, resources: false, budgets: new Set(), waitingForms: 0, turn };
 if (elicit) {
  // A tool's deadline stops while a person answers its form or question, however long they take.
  const waitingFor = async <T,>(answer: () => Promise<T>) => {
   server.waitingForms++; for (const budget of server.budgets) budget.pause();
   try { return await answer(); }
   finally { if (--server.waitingForms === 0) for (const budget of server.budgets) budget.resume(); }
  };
  client.setRequestHandler(ElicitRequestSchema, (request, extra) => {
   const callbacks = server.turn.callbacks;
   if (!callbacks?.onForm) throw Error("No chat is using this server right now.");
   const formCallbacks = { ...callbacks,
    onForm: (...args: Parameters<NonNullable<AgentCallbacks["onForm"]>>) => waitingFor(() => callbacks.onForm!(...args)),
    ...(callbacks.onQuestion ? { onQuestion: (...args: Parameters<NonNullable<AgentCallbacks["onQuestion"]>>) => waitingFor(() => callbacks.onQuestion!(...args)) } : {}),
   };
   return respondMcpElicitation({ ...request.params, serverName: connection.name }, formCallbacks, AbortSignal.any([server.turn.signal, extra.signal]));
  });
 }
 const transport = connection.transport === "stdio"
  ? new StdioClientTransport({ command: connection.executable, args: connection.arguments, cwd, env: { ...getDefaultEnvironment(), ELECTRON_RUN_AS_NODE: "1" }, stderr: "ignore", maxBufferSize: 2 * 1024 * 1024 })
  : new StreamableHTTPClientTransport(new URL(connection.url), { requestInit: { headers: connection.headers } });
 if (transport instanceof StreamableHTTPClientTransport) server.http = transport;
 await client.connect(transport, { signal: setupSignal, timeout: 30000 });
 const capabilities = client.getServerCapabilities();
 server.prompts = Boolean(capabilities?.prompts); server.resources = Boolean(capabilities?.resources);
 if (capabilities?.tools) {
  let cursor: string | undefined; const cursors = new Set<string>(), names = new Set<string>();
  do {
   const page = await client.listTools(cursor ? { cursor } : {}, { signal: setupSignal, timeout: 30000 });
   for (const tool of page.tools) {
    if (!tool.name || tool.name.length > 1000 || names.has(tool.name) || names.size >= 200 || server.tools.length >= 500 || JSON.stringify(tool.inputSchema).length > 64000) throw Error("MCP tool discovery exceeded its supported limits.");
    names.add(tool.name); server.tools.push(tool);
   }
   cursor = page.nextCursor;
   if (cursor && (!cursor.length || cursor.length > 2048 || cursors.has(cursor))) throw Error("MCP returned an invalid tool-page cursor.");
   if (cursor) cursors.add(cursor);
  } while (cursor);
 }
 return server;
}

/** The agent's tools for one server, bound to this turn's signal. */
function serverTools(server: Server, signal: AbortSignal) {
 const { client, connection } = server, tools: AgentTool[] = [], labels: Record<string,string> = {};
 const budgetState = { active: server.budgets, waiting: () => server.waitingForms > 0 };
 let promptServer: PromptServer | undefined;
 if (server.prompts) {
  const prompts = phaseoMcpPromptTools(client, connection, signal, budgetState);
  tools.push(...prompts.tools); Object.assign(labels, prompts.labels);
  promptServer = { id: connection.id, name: connection.name, projectId: connection.projectId, list: prompts.list, get: prompts.get };
 }
 if (server.resources) { const resources = phaseoMcpResourceTools(client, connection, signal, budgetState); tools.push(...resources.tools); Object.assign(labels, resources.labels); }
 for (const tool of server.tools) {
  // Stable names isolate servers and remain valid provider tool identifiers.
  const id = `${nativeMcpName(connection)}_${createHash("sha256").update(tool.name).digest("hex").slice(0,20)}`;
  labels[id] = `${connection.name} · ${tool.name}`;
  tools.push(defineTool({ id, description: `MCP ${connection.name}: ${tool.name}. ${tool.description ?? ""}`.slice(0,4000), parameters: tool.inputSchema, requireApproval: true, onError: "return-to-model",
   async execute(input: unknown, context) {
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 1000000) throw Error("Invalid MCP tool arguments.");
    const budget = new McpCallBudget(); server.budgets.add(budget); if (server.waitingForms) budget.pause();
    try {
     const result = await client.callTool({ name: tool.name, arguments: input as Record<string,unknown> }, undefined, { signal: AbortSignal.any([signal, ...(context.signal ? [context.signal] : []), budget.signal]), timeout: 2147483647 });
     if (JSON.stringify(result).length > 1000000) throw Error("MCP tool result exceeds the 1 MB limit.");
     if (result.isError) throw Error(`MCP tool returned an error: ${JSON.stringify(result.content).slice(0,5000)}`);
     return result;
    } finally { server.budgets.delete(budget); budget.dispose(); }
   },
  }));
 }
 return { tools, labels, promptServer };
}

const poolKey = (owner: string, connection: McpConnection, cwd: string) => createHash("sha256").update(JSON.stringify([owner, cwd, connection.id, connection.transport, connection.transport === "stdio" ? [connection.executable, connection.arguments] : [connection.url, connection.headers]])).digest("hex");

async function connectServers(connections: McpConnection[], cwd: string, signal: AbortSignal, callbacks: AgentCallbacks | undefined, owner: string | undefined): Promise<PhaseoMcpSession> {
 if (signal.aborted) throw new AgentInputRejectedError("MCP setup cancelled. Your instruction was not submitted.");
 const setupSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
 const clients: Client[] = [], leased: { key: string; entry: Pooled }[] = [];
 const turn = { callbacks, signal };
 // Servers start side by side rather than one after another.
 const started = await Promise.allSettled(connections.map(async connection => {
  if (!owner) return startServer(connection, cwd, setupSignal, turn, client => clients.push(client));
  const key = poolKey(owner, connection, cwd);
  let entry = pool.get(key);
  if (!entry || entry.broken) {
   // A pooled server outlives this turn, so only its own deadline bounds its start.
   const created: Pooled = { connectionId: connection.id, server: startServer(connection, cwd, AbortSignal.timeout(30000), turn, () => {}), leases: 0, broken: false };
   const forget = () => { created.broken = true; if (pool.get(key) === created) pool.delete(key); };
   created.server.then(server => { server.client.onclose = forget; }, forget);
   pool.set(key, entry = created);
  }
  clearTimeout(entry.idle); entry.leases++; leased.push({ key, entry });
  const server = await entry.server;
  server.turn = turn;
  return server;
 }));
 const servers = started.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
 const release = async () => {
  for (const { key, entry } of leased.splice(0)) {
   if (--entry.leases > 0) continue;
   // A connection changed while in use is closed now that its last turn is over.
   if (entry.broken) { clearTimeout(entry.idle); await entry.server.then(server => disconnect(server), () => {}); continue; }
   const end = () => { if (pool.get(key) === entry) pool.delete(key); return entry.server.then(server => disconnect(server), () => {}); };
   if (phaseoMcpPool.idleMs <= 0) { await end(); continue; }
   entry.idle = setTimeout(() => void end(), phaseoMcpPool.idleMs);
   entry.idle.unref?.();
  }
 };
 let closing: Promise<void> | undefined;
 const close = () => closing ??= (async () => { signal.removeEventListener("abort", stop); const own = owner ? undefined : Promise.allSettled([...servers.map(server => disconnect(server, callbacks)), ...clients.filter(client => !servers.some(server => server.client === client)).map(client => client.close())]); await release(); await own; })();
 const stop = () => { void close(); };
 signal.addEventListener("abort", stop, { once: true });
 try {
  const failed = started.flatMap((result, index) => result.status === "rejected" ? [{ connection: connections[index], error: result.reason }] : []);
  if (failed.length && (!owner || signal.aborted)) throw failed[0].error;
  for (const { connection, error } of failed) callbacks?.onActivity?.({ id: `mcp-unavailable:${connection.id}`, type: "tool", title: `${connection.name} is unavailable`, text: `This MCP server could not be reached, so its tools are left out of this message.${error instanceof Error ? ` ${error.message.slice(0, 300)}` : ""}`, status: "failed" });
  const tools: AgentTool[] = [], labels: Record<string,string> = {}, promptServers: PromptServer[] = [];
  for (const server of servers) {
   const offered = serverTools(server, signal);
   if (tools.length + server.tools.length > 500) throw Error("MCP tool discovery exceeded its supported limits.");
   tools.push(...offered.tools); Object.assign(labels, offered.labels); if (offered.promptServer) promptServers.push(offered.promptServer);
  }
  if (setupSignal.aborted && !owner) throw Error("MCP setup cancelled or timed out.");
  return { tools, labels, promptServers, close };
 } catch {
  await close();
  throw new AgentInputRejectedError(signal.aborted ? "MCP setup cancelled. Your instruction was not submitted." : "MCP setup failed. Check enabled connections and server access, then retry. Your instruction was not submitted.");
 }
}
