import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
const native = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("./nativeProcess", () => ({ spawnNative: native.spawn }));
import { codexNativeActionCatalog, confirmCodexNativeAction, codexNativeActions } from "./codexNativeActions";
import type { JsonRpc } from "./jsonRpc";
const cwd = path.resolve("owned-project"), skillPath = path.join(cwd, ".agents", "skills", "review", "SKILL.md");
const skill = { name: "review", path: skillPath, enabled: true, description: "Review changes" };
const catalog = (skills: unknown[] = [skill]) => ({ data: [{ cwd, skills, errors: [] }] });
describe("OpenAI native skills", () => {
 it("discovers in an owned process without a thread or prompt and isolates the selected profile", async () => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); const requests: string[] = [];
  child.stdin.on("data", bytes => { for (const line of bytes.toString().trim().split("\n")) { const packet = JSON.parse(line); requests.push(packet.method); if (packet.id !== undefined) child.stdout.write(JSON.stringify({ id: packet.id, result: packet.method === "skills/list" ? catalog() : {} }) + "\n"); } });
  native.spawn.mockResolvedValueOnce(child);
  await codexNativeActions(cwd, new AbortController().signal, { id: "account", name: "Owned", harness: "codex", kind: "native", configured: true, configDirectory: path.join(cwd, "profile") });
  expect(requests).toEqual(["initialize", "initialized", "skills/list"]); expect(child.kill).toHaveBeenCalled(); expect(child.stdin.writableEnded).toBe(true);
  expect(native.spawn.mock.calls.at(-1)?.[4]).toEqual({ CODEX_HOME: path.join(cwd, "profile"), OPENAI_API_KEY: undefined, CODEX_API_KEY: undefined });
 });
 it("closes a stalled owned process on cancellation and rejects before spawning an already cancelled read", async () => {
  const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() }); native.spawn.mockResolvedValueOnce(child);
  const controller = new AbortController(); const result = codexNativeActions(cwd, controller.signal); const rejected = expect(result).rejects.toThrow("cancelled"); await vi.waitFor(() => expect(child.stdin.readableLength).toBeGreaterThan(0)); controller.abort(); await rejected; expect(child.kill).toHaveBeenCalled();
  const count = native.spawn.mock.calls.length; await expect(codexNativeActions(cwd, controller.signal)).rejects.toThrow(); expect(native.spawn.mock.calls.length).toBe(count);
 });
 it("preserves native path identity and excludes disabled skills", () => {
  expect(codexNativeActionCatalog(catalog([skill, { ...skill, path: skillPath + "-disabled", enabled: false }]), cwd)).toEqual({ actions: [{ kind: "skill", id: skillPath, name: "review", path: skillPath, description: "Review changes" }] });
 });
 it("rejects foreign scopes, native discovery errors and duplicate paths", () => {
  expect(() => codexNativeActionCatalog(catalog(), path.resolve("other-project"))).toThrow("invalid");
  expect(() => codexNativeActionCatalog({ data: [{ cwd, skills: [], errors: [{ message: "invalid" }] }] }, cwd)).toThrow("could not load");
  expect(() => codexNativeActionCatalog(catalog([skill, skill]), cwd)).toThrow("ambiguous");
 });
 it("rejects oversized catalogs and unsafe native identity metadata", () => {
  expect(() => codexNativeActionCatalog(catalog(Array(1001).fill(skill)), cwd)).toThrow("oversized");
  for (const value of [{ ...skill, name: "bad name" }, { ...skill, path: "relative/SKILL.md" }, { ...skill, enabled: "true" }]) expect(() => codexNativeActionCatalog(catalog([value]), cwd)).toThrow("identity");
 });
 it("forces a fresh scan and rejects removed or renamed skills", async () => {
  const requests: unknown[] = []; const rpc = { request: async (...args: unknown[]) => { requests.push(args); return catalog(); } } as unknown as JsonRpc;
  await confirmCodexNativeAction(rpc, cwd, { kind: "skill", id: skillPath, name: "review", arguments: "target" });
  expect(requests).toEqual([["skills/list", { cwds: [cwd], forceReload: true }, 15000]]);
  await expect(confirmCodexNativeAction(rpc, cwd, { kind: "skill", id: skillPath, name: "renamed", arguments: "" })).rejects.toThrow("no longer available");
 });
});
