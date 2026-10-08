import assert from "node:assert/strict";
import electron from "electron";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
const mode = process.argv.includes("--mode=chat") ? "chat" : "code";
const image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=";
const profile = mkdtempSync(path.join(tmpdir(), "phaseo-skill-crash-")), project = path.join(profile, "project"), workspace = path.join(profile, "workspace"), skill = path.join(workspace, "skills/review/SKILL.md"); mkdirSync(project); mkdirSync(path.dirname(skill), { recursive: true });
const definition = body => `---\nname: review\ndescription: Review a project\nuser-invocable: false\n---\n${body}`; writeFileSync(skill, definition("Initial crash guidance"));
const pendingSkill = path.join(workspace, "skills/explain/SKILL.md");
writeFileSync(path.join(profile, "owned.png"), Buffer.from(image, "base64"));
if (mode === "chat") { mkdirSync(path.dirname(pendingSkill), { recursive: true }); writeFileSync(pendingSkill, "---\nname: explain\ndescription: Explain clearly\nuser-invocable: false\n---\nOriginal pending guidance"); }
const db = new DatabaseSync(path.join(workspace, "workspace.sqlite")); db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY,data TEXT NOT NULL)"); db.prepare("INSERT INTO projects VALUES (?,?)").run("project", JSON.stringify({ id: "project", name: "Owned recovery", directory: project, createdAt: new Date().toISOString() })); db.close(); let calls = 0, fixtureError;
const server = createServer(async (request, response) => {
 try {
  let raw = ""; for await (const chunk of request) { raw += chunk; assert.ok(raw.length <= 1024 * 1024); }
  if (new URL(request.url, "http://owned.local").pathname.replace(/\/$/, "") === "/v1/models") { response.setHeader("content-type", "application/json"); response.end(JSON.stringify({ data: [{ id: "owned" }] })); return; }
  if (request.method !== "POST") { response.statusCode = 404; response.end(); return; }
  const body = JSON.parse(raw); calls++; let name, input;
  if (mode === "chat") {
   assert.equal(request.url, "/v1/chat/completions");
   const guidance = body.messages.find(message => message.role === "system")?.content;
   assert.ok(body.tools.every(tool => ["update_plan", "read_plan", "ask_user", "list_skills", "load_skill"].includes(tool.function.name)));
   assert.ok(body.messages.some(message => message.role === "user" && Array.isArray(message.content) && message.content.some(part => part.image_url?.url === "data:image/png;base64," + image)));
   assert.equal(body.messages.filter(message => message.role === "user" && JSON.stringify(message.content).includes("Owned crash recovery")).length, 1);
   if (calls === 1) { assert.ok(!guidance.includes("Initial crash guidance")); name = "load_skill"; input = { id: "global:review" }; }
   else if (calls === 2) { assert.ok(guidance.includes("Initial crash guidance")); name = "load_skill"; input = { id: "global:explain" }; }
   else {
    assert.equal(calls, 3); assert.ok(guidance.includes("Changed after crash") && guidance.includes("Changed pending guidance"));
    assert.ok(!guidance.includes("Initial crash guidance") && !guidance.includes("Original pending guidance"));
    assert.equal(body.messages.filter(message => message.role === "tool" && message.tool_call_id === "chat-2").length, 1);
    assert.equal(body.messages.filter(message => message.role === "user" && message.content === "Continue from where you stopped.").length, 1);
   }
   response.setHeader("content-type", "text/event-stream"); response.end("data: " + JSON.stringify({ choices: [{ delta: name ? { tool_calls: [{ index: 0, id: "chat-" + calls, type: "function", function: { name, arguments: JSON.stringify(input) } }] } : { content: "Recovery finished" }, finish_reason: name ? "tool_calls" : "stop" }] }) + "\n\ndata: [DONE]\n\n"); return;
  }
  assert.equal(request.url, "/v1/responses");
  assert.equal(body.input.filter(message => message.role === "user" && Array.isArray(message.content) && message.content.some(part => part.image_url === "data:image/png;base64," + image)).length, 1);
  if (calls >= 3) assert.equal(body.input.filter(message => message.role === "user" && message.content === "Continue from where you stopped.").length, 1);
  if (calls === 1) { assert.ok(!body.instructions.includes("Initial crash guidance")); name = "load_skill"; input = { id: "global:review" }; }
  else if (calls === 2) { assert.ok(body.instructions.includes("Initial crash guidance")); name = "write_project_file"; input = { path: "effect.txt", content: "Stale effect", expectedHash: "new", instructionRevision: body.instructions.match(/instructionRevision ([a-f0-9]{64})/)?.[1] }; }
  else if (calls === 3) { assert.ok(body.instructions.includes("Changed after crash")); assert.ok(JSON.stringify(body.input).includes("Project instructions changed")); assert.ok(!existsSync(path.join(project, "effect.txt"))); name = "write_project_file"; input = { path: "effect.txt", content: "Fresh approved effect", expectedHash: "new", instructionRevision: body.instructions.match(/instructionRevision ([a-f0-9]{64})/)?.[1] }; }
  else { assert.equal(calls, 4); assert.equal(readFileSync(path.join(project, "effect.txt"), "utf8"), "Fresh approved effect"); }
  const output = name ? [{ type: "function_call", id: "item" + calls, call_id: "call" + calls, name, arguments: JSON.stringify(input) }] : [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Recovery finished" }] }]; response.setHeader("content-type", "text/event-stream"); response.end("data: " + JSON.stringify({ type: "response.completed", response: { id: "response" + calls, status: "completed", model: "owned", output } }) + "\n\n");
 } catch (error) { fixtureError = error; console.error(error); response.statusCode = 500; response.end("Owned recovery fixture failure"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const endpoint = `http://127.0.0.1:${server.address().port}/v1`, entry = process.argv.find(value => value.startsWith("--app-entry="));
const launch = stage => {
 const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
 const child = spawn(electron, ["scripts/phaseo-skill-recovery-smoke.mjs", "--profile=" + profile, "--stage=" + stage, "--endpoint=" + endpoint, "--mode=" + mode, ...(entry ? [entry] : [])], { stdio: ["ignore", "pipe", "pipe"], env: environment });
 let output = ""; child.stdout.on("data", chunk => { output += chunk.toString(); process.stdout.write(chunk); }); child.stderr.on("data", chunk => process.stderr.write(chunk));
 return { child, output: () => output, exited: new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal }))) };
};
let active;
const stop = child => { if (child.exitCode !== null || child.signalCode !== null) return; if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL"); };
try {
 active = launch("write"); const deadline = Date.now() + 30000; while (!active.output().includes("SKILL_RECOVERY_PENDING")) { assert.ok(active.child.exitCode === null, "First app exited before its checkpoint"); assert.ok(Date.now() < deadline, "Checkpoint deadline expired"); await new Promise(resolve => setTimeout(resolve, 25)); }
 stop(active.child); await active.exited; const pending = JSON.parse(readFileSync(path.join(profile, "pending.json"), "utf8")), before = new DatabaseSync(path.join(workspace, "workspace.sqlite")); const run = JSON.parse(before.prepare("SELECT data FROM agent_runs WHERE id=?").get(pending.runId).data); before.close(); assert.equal(run.run.status, "waiting_for_human"); assert.equal(run.run.context.phaseoModelSkills[0].id, "global:review"); assert.ok(!existsSync(path.join(project, "effect.txt"))); assert.equal(calls, 2);
 assert.ok(JSON.stringify(run.run.messages).includes("data:image/png;base64," + image));
 if (mode === "chat") { assert.equal(run.run.pause.pendingToolCalls[0].call.input.id, "global:explain"); writeFileSync(pendingSkill, readFileSync(pendingSkill, "utf8").replace("Original pending guidance", "Changed pending guidance")); }
 writeFileSync(skill, definition("Changed after crash")); active = launch("read"); const result = await active.exited; assert.equal(result.code, 0); assert.ok(active.output().includes("SKILL_RECOVERY_RESUMED")); assert.ok(!fixtureError); assert.equal(calls, mode === "chat" ? 3 : 4); console.log("PHASEO_SKILL_RECOVERY_AUDIT", JSON.stringify({ mode, processRestarts: 1, forcedCrash: true, durableSkillContext: true, changedGuidanceReviewed: true, ...(mode === "chat" ? { originalImageRetained: true, historyRetainedOnce: true, pendingSkillReapproved: true, personalChat: true } : { staleEffectBlocked: true, freshEffect: true }), loopbackModelRequests: calls, providerInferenceCalls: 0, packaged: Boolean(entry) }));
} finally { if (active) stop(active.child); server.close(); }
