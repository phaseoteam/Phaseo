import path from "node:path";
import { JsonRpc } from "./jsonRpc";
import { spawnNative } from "./nativeProcess";
import { nativeAccountEnvironment } from "./nativeAccountEnvironment";
import type { Account } from "../shared/workspace";
import type { NativeAction, NativeActionCatalog } from "../shared/nativeActions";

export function codexNativeActionCatalog(value: unknown, cwd: string): NativeActionCatalog {
 if (!value || typeof value !== "object" || !Array.isArray((value as { data?: unknown }).data)) throw new Error("OpenAI returned an invalid skill catalog.");
 const data = (value as { data: unknown[] }).data;
 if (data.length !== 1) throw new Error("OpenAI returned an unexpected skill scope.");
 const entry = data[0] as { cwd?: unknown; skills?: unknown; errors?: unknown };
 if (!entry || typeof entry.cwd !== "string" || path.resolve(entry.cwd) !== path.resolve(cwd) || !Array.isArray(entry.skills) || entry.skills.length > 1000 || !Array.isArray(entry.errors)) throw new Error("OpenAI returned an invalid or oversized skill catalog.");
 if (entry.errors.length) throw new Error("OpenAI could not load all skills. Fix the native skill configuration and retry.");
 const actions: NativeActionCatalog["actions"] = []; const ids = new Set<string>();
 for (const raw of entry.skills) {
  const skill = raw as { name?: unknown; path?: unknown; enabled?: unknown; description?: unknown };
  if (!skill || typeof skill.name !== "string" || !skill.name || skill.name.length > 200 || /\s/.test(skill.name) || skill.name.startsWith("/") || typeof skill.path !== "string" || !path.isAbsolute(skill.path) || skill.path.length > 2000 || Array.from(skill.name + skill.path).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof skill.enabled !== "boolean") throw new Error("OpenAI returned an invalid skill identity.");
  if (!skill.enabled) continue;
  if (ids.has(skill.path)) throw new Error("OpenAI returned ambiguous skill identities."); ids.add(skill.path);
  actions.push({ kind: "skill", id: skill.path, name: skill.name, path: skill.path, description: typeof skill.description === "string" ? skill.description.slice(0, 1000) : "" });
 }
 return { actions: actions.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) };
}
export async function confirmCodexNativeAction(rpc: JsonRpc, cwd: string, action: NativeAction) {
 const catalog = codexNativeActionCatalog(await rpc.request("skills/list", { cwds: [cwd], forceReload: true }, 15000), cwd);
 if (!catalog.actions.some(entry => entry.kind === action.kind && entry.id === action.id && entry.name === action.name)) throw new Error("This OpenAI skill is no longer available.");
}
export async function codexNativeActions(cwd: string, signal: AbortSignal, account?: Account) {
 signal.throwIfAborted(); const child = await spawnNative("codex", ["app-server", "--stdio"], cwd, "@openai/codex/bin/codex.js", nativeAccountEnvironment(account));
 const rpc = new JsonRpc(child.stdout, child.stdin); child.stderr.resume();
 const abort = () => { rpc.close(new Error("OpenAI skill discovery cancelled.")); child.kill(); };
 child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close());
 signal.addEventListener("abort", abort, { once: true });
 try {
  if (signal.aborted) { abort(); signal.throwIfAborted(); }
  await rpc.request("initialize", { clientInfo: { name: "phaseo_desktop", title: "Phaseo", version: "0.1.0" }, capabilities: { experimentalApi: true } }, 15000); rpc.notify("initialized");
  return codexNativeActionCatalog(await rpc.request("skills/list", { cwds: [cwd], forceReload: true }, 15000), cwd);
 } finally { signal.removeEventListener("abort", abort); rpc.close(); child.stdin.end(); child.kill(); }
}
