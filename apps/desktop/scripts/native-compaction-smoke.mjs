import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { builtinModules } from "node:module";
import { build } from "vite";

// The installed native process talks only to this owned provider fixture.
// Its temporary profile has no copied accounts, credentials or project files.
const directory = mkdtempSync(path.join(tmpdir(), "phaseo-native-compaction-"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requests = [];
const server = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) { body += chunk; if (body.length > 1024 * 1024) throw new Error("Owned request exceeds fixture limit."); }
    assert.equal(request.method, "POST"); assert.equal(request.url, "/v1/responses");
    assert.equal(JSON.parse(body).model, "owned-compaction-model"); requests.push(request.url);
    const ordinal = requests.length;
    const text = ordinal === 2 ? "Owned compact summary" : "Owned seed answer 世界";
    const item = { id: "m" + ordinal, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
    const result = { id: "r" + ordinal, object: "response", status: "completed", output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of [
      { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
      { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: text },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: result },
    ]) response.write("event: " + event.type + "\ndata: " + JSON.stringify(event) + "\n\n");
    response.end();
  } catch { response.writeHead(500, { "content-type": "application/json" }); response.end(JSON.stringify({ error: { message: "Owned provider fixture rejected the request." } })); }
});
const previousKey = process.env.PHASEO_OWNED_NATIVE_KEY;
let adapter;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  writeFileSync(path.join(directory, "config.toml"), [
    'model = "owned-compaction-model"', 'model_provider = "owned"', 'model_context_window = 4096', 'model_auto_compact_token_limit = 1000000',
    '[model_providers.owned]', 'name = "Owned native fixture"', 'base_url = "http://127.0.0.1:' + server.address().port + '/v1"',
    'wire_api = "responses"', 'env_key = "PHASEO_OWNED_NATIVE_KEY"', 'requires_openai_auth = false', 'supports_websockets = false', '[analytics]', 'enabled = false',
  ].join("\n"));
  process.env.PHASEO_OWNED_NATIVE_KEY = "owned-test-only";
  // Compile the production adapter; do not replace its transport or native process.
  const output = path.join(directory, "adapter");
  await build({ configFile: false, root, logLevel: "silent", build: { outDir: output, emptyOutDir: true, lib: { entry: path.join(root, "src/main/codexAdapter.ts"), formats: ["es"], fileName: () => "adapter.mjs" }, rollupOptions: { external: [...builtinModules, ...builtinModules.map(name => "node:" + name)] } } });
  const { CodexAdapter } = await import(pathToFileURL(path.join(output, "adapter.mjs")).href);
  const account = { id: "owned", name: "Owned profile", kind: "native", harness: "codex", configDirectory: directory };
  const task = { id: "owned", title: "Owned native compaction", harness: "codex", model: "owned-compaction-model", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], createdAt: "", updatedAt: "" };
  let nativeSessionId; let seed = ""; const activities = []; const compactText = [];
  async function run(input, text, callbacks) {
    adapter = new CodexAdapter(); let timer;
    try { await Promise.race([adapter.run(input, directory, text, { onApproval: async () => "decline", ...callbacks }, account), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Owned native compaction timed out.")), 20000); })]); }
    finally { clearTimeout(timer); await adapter.cancel(); }
  }
  await run(task, "Owned seed message", { onSession: id => { nativeSessionId = id; }, onDelta: (_id, text) => { seed += text; } });
  assert.ok(nativeSessionId); assert.equal(seed, "Owned seed answer 世界"); assert.equal(requests.length, 1);
  await run({ ...task, nativeSessionId }, "/compact", { onSession: id => assert.equal(id, nativeSessionId), onDelta: (_id, text) => compactText.push(text), onActivity: activity => activities.push(activity) });
  const compaction = activities.filter(activity => activity.type === "compaction");
  assert.deepEqual(compaction.map(activity => activity.status), ["running", "completed"]);
  assert.equal(compaction[0].id, compaction[1].id); assert.equal(compaction[1].text, ""); assert.deepEqual(compactText, []); assert.equal(requests.length, 2);
  console.log("NATIVE_COMPACTION_SMOKE", JSON.stringify({ productionAdapter: true, installedNativeProcess: true, isolatedProfile: true, seedOutput: true, nativeResume: true, compactionLifecycle: true, turnSettled: true, noFabricatedSummary: true, ownedProviderRequests: requests.length }));
} finally {
  await adapter?.cancel();
  if (previousKey === undefined) delete process.env.PHASEO_OWNED_NATIVE_KEY; else process.env.PHASEO_OWNED_NATIVE_KEY = previousKey;
  await new Promise(resolve => server.close(resolve));
  await new Promise(resolve => setTimeout(resolve, 500));
  try { rmSync(directory, { recursive: true, force: true }); } catch { console.log("Owned fixture retained:", directory); }
}
