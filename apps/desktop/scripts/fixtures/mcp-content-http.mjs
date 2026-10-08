import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";

/** Owned legacy-session HTTP content fixture with bidirectional form elicitation. */
export async function startContentHttpFixture(calls, promptMode) {
 const sessions = new Map(), ended = new Set(); let failure, initialized = 0, terminated = 0;
 const server = createServer(async (request, response) => {
  try {
   if (request.url !== "/mcp") throw Error("Unexpected owned content route.");
   const sessionId = request.headers["mcp-session-id"], session = sessions.get(sessionId);
   if (request.method === "DELETE") {
    if (!session) throw Error("Content cleanup outside a live session.");
    for (const form of session.forms.values()) form.response.destroy();
    session.forms.clear(); sessions.delete(sessionId); ended.add(sessionId); terminated++;
    response.writeHead(204); response.end(); return;
   }
   if (request.method === "GET") { response.writeHead(405); response.end(); return; }
   if (request.method !== "POST") throw Error("Unexpected owned content method.");
   let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 1000000) throw Error("Owned content request too large."); }
   const rpc = JSON.parse(raw);
   if (rpc.method === "initialize") {
    if (!rpc.params.capabilities.elicitation?.form) throw Error("Content client did not negotiate form elicitation.");
    const id = randomUUID(); sessions.set(id, { forms: new Map() }); initialized++;
    response.writeHead(200, { "content-type": "application/json", "mcp-session-id": id });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { protocolVersion: rpc.params.protocolVersion, capabilities: promptMode ? { prompts: {} } : { resources: {} }, serverInfo: { name: "owned-http-content", version: "1" } } })); return;
   }
   if (!session) {
    if (ended.has(sessionId) && rpc.method === "notifications/cancelled" && rpc.id === undefined) { response.writeHead(404); response.end(); return; }
    throw Error("Content request outside a live session.");
   }
   if (rpc.method === undefined && rpc.id !== undefined) {
    const form = session.forms.get(rpc.id);
    if (form && rpc.result?.action === "cancel") { session.forms.delete(rpc.id); form.response.destroy(); response.writeHead(202); response.end(); return; }
    if (!form || rpc.result?.action !== "accept" || rpc.result.content?.topic !== "work") throw Error("Owned content form answer missing: " + JSON.stringify({ formExists: Boolean(form), result: rpc.result, error: rpc.error }));
    session.forms.delete(rpc.id); appendFileSync(calls, form.identity + "\n");
    const result = promptMode ? { messages: [{ role: "user", content: { type: "text", text: "Owned prompt content" } }] } : { contents: [{ uri: form.identity, text: "Owned document content" }] };
    form.response.end(`data: ${JSON.stringify({ jsonrpc: "2.0", id: form.id, result })}\n\n`);
    response.writeHead(202); response.end(); return;
   }
   if (rpc.id === undefined) { response.writeHead(202); response.end(); return; }
   if (rpc.method !== (promptMode ? "prompts/get" : "resources/read")) throw Error("Unexpected owned content operation.");
   if (promptMode ? rpc.params.name !== "brief" || rpc.params.arguments?.topic !== "work" : rpc.params.uri !== "notes:owned") throw Error("Owned content arguments missing.");
   const formId = randomUUID(); session.forms.set(formId, { id: rpc.id, identity: promptMode ? rpc.params.name : rpc.params.uri, response });
   response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
   response.write(`data: ${JSON.stringify({ jsonrpc: "2.0", id: formId, method: "elicitation/create", params: { mode: "form", message: "Which notes?", requestedSchema: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } } })}\n\n`);
  } catch (error) { failure = error; console.error("Owned HTTP content fixture:", error); if (!response.headersSent) response.writeHead(500); response.end(); }
 });
 await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
 return { url: `http://127.0.0.1:${server.address().port}/mcp`, sessions, get failure() { return failure; }, get initialized() { return initialized; }, get terminated() { return terminated; }, close: async () => { for (const session of sessions.values()) for (const form of session.forms.values()) form.response.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
