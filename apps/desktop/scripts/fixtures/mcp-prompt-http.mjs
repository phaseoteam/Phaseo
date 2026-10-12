import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";

/** Owned prompt-only HTTP service; no provider access or external effects. */
export async function startPromptHttpFixture(calls, control, pixels) {
 const sessions = new Map(), ended = new Map(); let failure, terminations = 0;
 const log = value => appendFileSync(calls, JSON.stringify(value) + "\n");
 const server = createServer(async (request, response) => {
  try {
   const name = request.url?.slice(1);
   if (!["Global", "Project"].includes(name)) throw Error("Unexpected prompt fixture route.");
   const sessionId = request.headers["mcp-session-id"], session = sessions.get(sessionId);
   if (request.method === "DELETE") {
    if (!session || session.name !== name) throw Error("Invalid prompt cleanup session.");
    for (const [timer, pending] of session.pending) { clearTimeout(timer); pending.destroy(); }
    sessions.delete(sessionId); ended.set(sessionId, name); terminations++; log({ server: name, sessionId, closed: true });
    response.writeHead(204); response.end(); return;
   }
   if (request.method === "GET") { response.writeHead(405); response.end(); return; }
   if (request.method !== "POST") throw Error("Unexpected prompt fixture method.");
   let raw = ""; for await (const chunk of request) { raw += chunk; if (raw.length > 1000000) throw Error("Prompt fixture request too large."); }
   const rpc = JSON.parse(raw);
   let owner = sessionId, active = session;
   if (rpc.method === "initialize") { owner = randomUUID(); active = { name, pending: new Map() }; sessions.set(owner, active); }
   else if (!active || active.name !== name) {
    // Aborting a read races its cancellation notification against DELETE. A
    // terminated HTTP session must return 404, without recreating that session.
    if (ended.get(sessionId) === name && rpc.method === "notifications/cancelled" && rpc.id === undefined) {
     log({ server: name, sessionId, method: rpc.method, afterTermination: true }); response.writeHead(404); response.end(); return;
    }
    throw Error("Prompt request outside its live session.");
   }
   log({ server: name, sessionId: owner, method: rpc.method, params: rpc.params });
   if (rpc.id === undefined) { response.writeHead(202); response.end(); return; }
   const flags = JSON.parse(readFileSync(control, "utf8"));
   const reply = () => {
    if (response.destroyed) return;
    let result, error;
    if (rpc.method === "initialize") result = { protocolVersion: rpc.params.protocolVersion, capabilities: { prompts: {} }, serverInfo: { name: "owned-http-prompts", version: "1" } };
    else if (rpc.method === "prompts/list") {
     if (flags.failList) error = { code: -32000, message: "Owned catalog failure" };
     else result = rpc.params?.cursor ? { prompts: [{ name: "later" }] } : { prompts: [{ name: "brief", description: "Write an owned brief", arguments: [{ name: "topic", description: "Subject", required: true }] }, { name: "media", description: "Media preview" }, { name: "long-" + "x".repeat(700), description: "Owned wrapping test" }], nextCursor: "next" };
    } else if (rpc.method === "prompts/get") {
     if (flags.failGet) error = { code: -32000, message: "Owned preview failure" };
     else { result = { messages: rpc.params.name === "media" ? [{ role: "user", content: { type: "image", mimeType: "image/png", data: flags.invalidImage ? "YWJj" : pixels } }] : [{ role: "user", content: { type: "text", text: name + " brief for " + rpc.params.arguments.topic } }, { role: "assistant", content: { type: "text", text: "Example answer" } }] }; log({ server: name, sessionId: owner, retrieved: rpc.params.name }); }
    } else throw Error("Unexpected prompt fixture operation.");
    response.writeHead(200, { "content-type": "application/json", ...(rpc.method === "initialize" ? { "mcp-session-id": owner } : {}) });
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, ...(error ? { error } : { result }) }));
   };
   const delay = rpc.method === "prompts/list" ? flags.delayList : rpc.method === "prompts/get" ? flags.delayGet : 0;
   if (delay) { const timer = setTimeout(() => { active.pending.delete(timer); try { reply(); } catch (error) { failure = error; response.destroy(); } }, delay); active.pending.set(timer, response); }
   else reply();
  } catch (error) { failure = error; console.error("Owned HTTP prompt fixture:", error); response.writeHead(500); response.end(); }
 });
 await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
 return { url: `http://127.0.0.1:${server.address().port}`, sessions, get failure() { return failure; }, get terminations() { return terminations; }, close: async () => { for (const session of sessions.values()) for (const [timer, response] of session.pending) { clearTimeout(timer); response.destroy(); } server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
