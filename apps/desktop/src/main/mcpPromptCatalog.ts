import { connectPhaseoMcp } from "./phaseoMcp";
import { mcpPromptDraft, type McpPromptCatalog, type McpPromptEntry, type McpPromptPreview, type McpPromptRequest } from "../shared/mcpPrompts";
import type { McpConnection } from "../shared/mcp";

export class McpPromptCatalogService {
 constructor(private readonly connections: McpConnection[], private readonly cwd: string, private readonly projectId?: string) {}
 async request(value: unknown, signal: AbortSignal): Promise<McpPromptCatalog | McpPromptPreview> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid MCP prompt request.");
  const request = value as McpPromptRequest;
  if (request.type !== "list" && request.type !== "preview") throw Error("Invalid MCP prompt request.");
  let connections = this.connections.filter(connection => connection.enabled && !connection.archived && (!connection.projectId || connection.projectId === this.projectId));
  if (request.type === "preview") {
   if (typeof request.connectionId !== "string" || !/^[a-f0-9-]{36}$/.test(request.connectionId) || typeof request.name !== "string" || !request.name.length || request.name.length > 1000 || !request.arguments || typeof request.arguments !== "object" || Array.isArray(request.arguments) || Object.keys(request.arguments).length > 100 || Object.values(request.arguments).some(value => typeof value !== "string" || value.length > 16384) || Buffer.byteLength(JSON.stringify(request.arguments), "utf8") > 100000) throw Error("Invalid MCP prompt preview.");
   connections = connections.filter(connection => connection.id === request.connectionId);
   if (!connections.length) throw Error("This prompt service is unavailable in this chat.");
  }
  const session = await connectPhaseoMcp(connections, this.cwd, signal);
  try {
   if (request.type === "preview") {
    const server = session.promptServers.find(server => server.id === request.connectionId);
    if (!server) throw Error("This service does not provide prompts.");
    const result = await server.get(request.name, request.arguments);
    return { server: server.name, name: request.name, description: result.description, messages: result.messages, ...mcpPromptDraft(result.messages) };
   }
   const prompts: McpPromptEntry[] = []; let catalogBytes = 14;
   for (const server of session.promptServers) {
    let cursor: string | undefined, pages = 0; const cursors = new Set<string>(), names = new Set<string>();
    do {
     if (++pages > 20) throw Error("MCP prompt discovery exceeds 20 pages per service.");
     const page = await server.list(cursor);
     for (const prompt of page.prompts) {
      const args = prompt.arguments ?? [];
      if (!prompt.name.length || prompt.name.length > 1000 || names.has(prompt.name) || prompts.length >= 2000 || (prompt.description?.length ?? 0) > 4000 || args.length > 100 || new Set(args.map(arg => arg.name)).size !== args.length || args.some(arg => !arg.name.length || arg.name.length > 1000 || (arg.description?.length ?? 0) > 4000)) throw Error("MCP prompt definitions exceed supported limits.");
      const entry = { connectionId: server.id, server: server.name, name: prompt.name, description: prompt.description ?? "", arguments: args };
      catalogBytes += Buffer.byteLength(JSON.stringify(entry), "utf8") + (prompts.length ? 1 : 0);
      if (catalogBytes > 2 * 1024 * 1024) throw Error("MCP prompt catalog exceeds 2 MB.");
      names.add(prompt.name); prompts.push(entry);
     }
     cursor = page.nextCursor;
     if (cursor && cursors.has(cursor)) throw Error("MCP returned a repeated prompt cursor.");
     if (cursor) cursors.add(cursor);
    } while (cursor);
   }
   prompts.sort((left, right) => left.server.localeCompare(right.server) || left.name.localeCompare(right.name));
   return { prompts };
  } finally { await session.close(); }
 }
}
