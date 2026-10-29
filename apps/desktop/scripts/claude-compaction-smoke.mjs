import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { builtinModules } from "node:module";
import { build } from "vite";

// Exercise the production adapter and installed CLI with an empty owned profile.
// Any model request goes to the rejecting loopback fixture; no real credential is copied.
const directory = mkdtempSync(path.join(tmpdir(), "phaseo-claude-compact-"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requests = []; let adapter;
const server = createServer((request, response) => { requests.push(request.url); request.resume(); response.writeHead(500, { "content-type": "application/json" }); response.end(JSON.stringify({ error: { type: "api_error", message: "No inference is allowed in this owned no-op fixture." } })); });
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  writeFileSync(path.join(directory, "settings.json"), JSON.stringify({ disableAllHooks: true, env: { ANTHROPIC_API_KEY: "owned-test-only", ANTHROPIC_BASE_URL: "http://127.0.0.1:" + server.address().port, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" } }));
  const output = path.join(directory, "adapter");
  await build({ configFile: false, root, logLevel: "silent", build: { outDir: output, emptyOutDir: true, lib: { entry: path.join(root, "src/main/claudeAdapter.ts"), formats: ["es"], fileName: () => "adapter.mjs" }, rollupOptions: { external: [...builtinModules, ...builtinModules.map(name => "node:" + name)] } } });
  const { ClaudeAdapter } = await import(pathToFileURL(path.join(output, "adapter.mjs")).href);
  adapter = new ClaudeAdapter();
  const activities = []; const deltas = []; let nativeSessionId; let timer;
  try {
    await Promise.race([
      adapter.run({ id: "owned", title: "Owned no-op", harness: "claude", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" }, directory, "/compact", { onSession: id => { nativeSessionId = id; }, onDelta: (_id, text) => deltas.push(text), onActivity: activity => activities.push(activity), onApproval: async () => "decline" }, { id: "owned", name: "Owned profile", kind: "native", harness: "claude", configDirectory: directory }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Owned Claude no-op timed out.")), 20000); }),
    ]);
  } finally { clearTimeout(timer); await adapter.cancel(); }
  assert.ok(nativeSessionId); assert.ok(requests.every(url => url === "/api/hello"), "The no-op must not send any inference request."); assert.ok(deltas.every(text => text === activities[0]?.text), "Native output must be preserved exactly.");
  assert.equal(activities.length, 1); assert.equal(activities[0].title, "Compaction result"); assert.equal(activities[0].status, "completed"); assert.match(activities[0].text, /(no messages|not enough messages) to compact/i);
  console.log("CLAUDE_COMPACTION_SMOKE", JSON.stringify({ productionAdapter: true, installedNativeProcess: true, isolatedProfile: true, nativeNoOpRetained: true, noFabricatedBoundary: true, startupRequests: requests.length, inferenceRequests: 0 }));
} finally {
  await adapter?.cancel(); await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => setTimeout(resolve, 500));
  try { rmSync(directory, { recursive: true, force: true }); } catch { console.log("Owned fixture retained:", directory); }
}
