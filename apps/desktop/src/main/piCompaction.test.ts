import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Task } from "../shared/workspace";
import type { PiRecord } from "./piRpc";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { PiAdapter } from "./piAdapter";
import { WorkspaceRuntime } from "./workspaceRuntime";
import { WorkspaceStore } from "./workspaceStore";
import { taskExport } from "./taskExport";

const task: Task = { id: "owned", title: "Pi", harness: "pi", model: "default", mode: "chat", status: "idle", pinned: false, archived: false, messages: [], queue: [], nativeSessionId: "/sessions/owned.jsonl", createdAt: "", updatedAt: "" };
const result = { summary: "## Saved context\n\nKeep <untrusted> 世界 and the original files.", firstKeptEntryId: "entry", tokensBefore: 1234, estimatedTokensAfter: 234, details: { readFiles: ["notes.txt"] } };
const sink = () => ({ onSession: vi.fn(), onDelta: vi.fn(), onActivity: vi.fn(), onApproval: vi.fn(async () => "decline" as const) });
function fixture(handle: (packet: PiRecord, send: (event: PiRecord) => void) => void) {
 const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
 let buffer = ""; const packets: PiRecord[] = [];
 const send = (event: PiRecord) => child.stdout.write(JSON.stringify(event) + "\n");
 child.stdin.on("data", chunk => { buffer += chunk.toString(); let newline: number; while ((newline = buffer.indexOf("\n")) !== -1) { const packet = JSON.parse(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); packets.push(packet); handle(packet, send); } });
 native.spawn.mockResolvedValue(child); return { child, packets, send };
}
const reply = (packet: PiRecord, send: (event: PiRecord) => void, data?: unknown) => send({ type: "response", id: packet.id, command: packet.type, success: true, data });
const state = { sessionFile: task.nativeSessionId, isStreaming: false, isCompacting: false, pendingMessageCount: 0 };

describe("Pi native context compaction", () => {
 it("resumes the selected session and uses the compact RPC without tool approval or assistant output", async () => {
  const wire = fixture((packet, send) => {
   if (packet.type === "get_state") reply(packet, send, state);
   if (packet.type === "set_model") reply(packet, send);
   if (packet.type === "compact") { send({ type: "compaction_start", reason: "manual" }); send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Internal summary" } }); send({ type: "compaction_end", reason: "manual", result }); reply(packet, send, result); }
  });
  const callbacks = sink(); await new PiAdapter().run({ ...task, mode: "code", model: "provider/model" }, "/project", " /compact ", callbacks);
  expect(wire.packets.map(packet => packet.type)).toEqual(["set_model", "get_state", "compact", "get_state"]);
  expect(native.spawn.mock.lastCall?.[1]).toEqual(["--mode", "rpc", "--session", task.nativeSessionId, "--no-tools"]);
  expect(callbacks.onApproval).not.toHaveBeenCalled(); expect(callbacks.onDelta).not.toHaveBeenCalled(); expect(callbacks.onSession).toHaveBeenCalledWith(task.nativeSessionId);
  expect(callbacks.onActivity.mock.calls.map(([activity]) => activity)).toEqual([{ id: "compaction:manual", type: "compaction", title: "Context compaction", text: "", status: "running" }, { id: "compaction:manual", type: "compaction", title: "Context compaction", text: JSON.stringify(result, null, 2), summary: result.summary, status: "completed" }]);
  expect(wire.child.kill).toHaveBeenCalled();
 });
 it("waits for native compaction/queued work to become idle after the response", async () => {
  let states = 0; const callbacks = sink(); let finished = false;
  fixture((packet, send) => { if (packet.type === "get_state") { states++; reply(packet, send, { ...state, isCompacting: states === 2 }); } if (packet.type === "compact") reply(packet, send, result); });
  const run = new PiAdapter().run(task, "/project", "/compact", callbacks).then(() => { finished = true; });
  await vi.waitFor(() => expect(states).toBe(2)); expect(finished).toBe(false); await run; expect(states).toBe(3);
 });
 it.each([undefined, {}, { summary: 4 }])("rejects unconfirmed successful responses (%s)", async value => {
  fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "compact") reply(packet, send, value); });
  const callbacks = sink(); await expect(new PiAdapter().run(task, "/project", "/compact", callbacks)).rejects.toThrow("did not confirm");
  expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compaction:manual", status: "failed" }); expect(callbacks.onDelta).not.toHaveBeenCalled();
 });
 it("retains native rejections without claiming a summary", async () => {
  fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "compact") send({ type: "response", id: packet.id, success: false, error: "No messages to compact" }); });
  const callbacks = sink(); await expect(new PiAdapter().run(task, "/project", "/compact", callbacks)).rejects.toThrow("No messages to compact");
  expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ status: "failed", text: "No messages to compact" });
 });
 it.each(["stop", "exit"])("fails an unfinished result after %s", async action => {
  const wire = fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (["clear_queue", "abort"].includes(String(packet.type))) reply(packet, send); });
  const adapter = new PiAdapter(), callbacks = sink(); const run = adapter.run(task, "/project", "/compact", callbacks); const rejected = expect(run).rejects.toThrow(action === "stop" ? "Task stopped" : "Pi process stopped");
  await vi.waitFor(() => expect(wire.packets.some(packet => packet.type === "compact")).toBe(true));
  await expect(adapter.steer({ id: "live", text: "Change this", createdAt: "" }, [])).rejects.toThrow("not accepting");
  if (action === "stop") await adapter.cancel(); else wire.child.emit("exit", 1); await rejected;
  expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compaction:manual", status: "failed" }); expect(callbacks.onDelta).not.toHaveBeenCalled();
 });
 it("keeps an attached /compact message on the ordinary prompt path", async () => {
  const wire = fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "prompt") { reply(packet, send, { disposition: "started" }); send({ type: "agent_settled" }); } });
  await new PiAdapter().run(task, "/project", "/compact", sink(), undefined, [{ id: "notes", taskId: task.id, name: "notes.txt", kind: "text", mimeType: "text/plain", size: 5, filePath: "/notes", text: "Notes" }]);
  expect(wire.packets.some(packet => packet.type === "compact")).toBe(false); expect(wire.packets.find(packet => packet.type === "prompt")?.message).toContain("Notes");
 });
 it.each(["compaction", "auto_compaction"])("projects %s events and ignores duplicate lifecycle notifications", async prefix => {
  const end = { type: prefix + "_end", reason: "threshold", result, aborted: false, willRetry: false };
  fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "prompt") { reply(packet, send, { disposition: "started" }); send({ type: prefix + "_start", reason: "threshold" }); send({ type: prefix + "_start", reason: "threshold" }); send(end); send(end); send({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Native answer" } }); send({ type: "agent_settled" }); } });
  const callbacks = sink(); await new PiAdapter().run(task, "/project", "Continue", callbacks);
  expect(callbacks.onActivity).toHaveBeenCalledTimes(2); expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ id: "compaction:1", title: "Automatic context compaction", status: "completed", summary: result.summary, text: JSON.stringify(end, null, 2) }); expect(callbacks.onDelta).toHaveBeenCalledExactlyOnceWith("assistant", "Native answer");
 });
 it.each([{ aborted: true }, { aborted: false, errorMessage: "Native summary failed" }])("retains unsuccessful automatic events (%s)", async outcome => {
  const end = { type: "compaction_end", reason: "overflow", ...outcome };
  fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "prompt") { reply(packet, send, { disposition: "started" }); send({ type: "compaction_start", reason: "overflow" }); send(end); send({ type: "agent_settled" }); } });
  const callbacks = sink(); await new PiAdapter().run(task, "/project", "Continue", callbacks);
  expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ status: "failed", text: JSON.stringify(end, null, 2) }); expect(callbacks.onActivity.mock.lastCall?.[0].summary).toBeUndefined();
 });
 it("does not treat missing automatic completion as confirmed", async () => {
  fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "prompt") { reply(packet, send, { disposition: "started" }); send({ type: "compaction_start", reason: "threshold" }); send({ type: "agent_settled" }); } });
  const callbacks = sink(); await new PiAdapter().run(task, "/project", "Continue", callbacks);
  expect(callbacks.onActivity.mock.lastCall?.[0]).toMatchObject({ status: "failed", text: "Native compaction ended without confirmation." });
 });
 it("persists summary and original result without replacing local history", async () => {
  fixture((packet, send) => { if (packet.type === "get_state") reply(packet, send, state); if (packet.type === "compact") reply(packet, send, result); });
  const directory = mkdtempSync(path.join(tmpdir(), "phaseo-pi-compaction-")); const runtime = new WorkspaceRuntime(directory, () => new PiAdapter()); let id = "";
  try {
   const created = await runtime.command({ type: "create-task", harness: "pi", model: "default", mode: "chat" }); id = created.tasks[0].id; const original = runtime.store.getTask(id); original.nativeSessionId = task.nativeSessionId; original.messages = [{ id: "old", role: "assistant", text: "Saved answer 世界", createdAt: original.createdAt }]; runtime.store.saveTask(original);
   await runtime.command({ type: "send", id, text: "/compact" }); await vi.waitFor(() => expect(runtime.store.getTask(id).status).toBe("completed"));
   const saved = runtime.store.getTask(id); expect(saved.messages.map(message => message.text)).toEqual(["Saved answer 世界", "/compact"]); expect(saved.activities?.[0]).toMatchObject({ summary: result.summary, text: JSON.stringify(result, null, 2), status: "completed" });
   expect(JSON.parse(await taskExport(saved, "json", runtime.attachments)).messages.map((message: { text: string }) => message.text)).toEqual(saved.messages.map(message => message.text));
  } finally { await runtime.close(); }
  const reopened = new WorkspaceStore(path.join(directory, "workspace.sqlite")); try { expect(reopened.getTask(id).activities?.[0]).toMatchObject({ summary: result.summary, text: JSON.stringify(result, null, 2) }); } finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
 });
});
