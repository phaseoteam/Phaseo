const fs = require("node:fs");
const path = require("node:path");
const directory = process.env.PHASEO_PI_FIXTURE_DIRECTORY;
if (!directory) throw new Error("Owned Pi fixture directory is required.");
const result = JSON.parse(fs.readFileSync(path.join(directory, "result.json"), "utf8"));
const selected = process.argv.indexOf("--session");
const session = selected >= 0 ? path.resolve(process.argv[selected + 1]) : path.join(directory, "session.jsonl");
if (!session.startsWith(path.resolve(directory) + path.sep)) throw new Error("Pi fixture session is outside its owned directory.");
if (!fs.existsSync(session)) fs.writeFileSync(session, JSON.stringify({ type: "session", version: 3, id: "owned-pi", cwd: directory }) + "\n");
const send = event => process.stdout.write(JSON.stringify(event) + "\n");
let buffer = "";
process.stdin.on("data", chunk => {
 buffer += chunk.toString("utf8"); let newline;
 while ((newline = buffer.indexOf("\n")) >= 0) {
  const request = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
  fs.appendFileSync(path.join(directory, "requests.jsonl"), JSON.stringify({ type: request.type, session }) + "\n");
  const reply = data => send({ type: "response", id: request.id, command: request.type, success: true, data });
  if (request.type === "get_state") reply({ sessionFile: session, isStreaming: false, isCompacting: false, pendingMessageCount: 0 });
  else if (request.type === "get_available_models") reply({ models: [] });
  else if (request.type === "prompt") { reply({ disposition: "started" }); send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Owned Pi answer 世界" } }); send({ type: "agent_settled" }); }
  else if (request.type === "compact") { send({ type: "compaction_start", reason: "manual" }); fs.appendFileSync(session, JSON.stringify({ type: "compaction", id: "owned-boundary", ...result }) + "\n"); send({ type: "compaction_end", reason: "manual", result, aborted: false }); reply(result); }
  else if (["abort", "clear_queue", "set_model"].includes(request.type)) reply();
  else send({ type: "response", id: request.id, command: request.type, success: false, error: "Unsupported owned Pi fixture command" });
 }
});
