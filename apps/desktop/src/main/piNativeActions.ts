import { spawnNative } from "./nativeProcess";
import { piEntries } from "./piLaunch";
import { PiRpc } from "./piRpc";
import type { NativeActionCatalog, NativeActionEntry } from "../shared/nativeActions";
function clean(value: unknown, max: number) { return typeof value === "string" && value.length <= max && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? value : undefined; }
export function piNativeActionCatalog(value: unknown): NativeActionCatalog {
 const commands = value && typeof value === "object" && "commands" in value ? value.commands : undefined;
 if (!Array.isArray(commands) || commands.length > 1000) throw new Error("Pi returned an invalid or oversized command catalog.");
 const actions: NativeActionEntry[] = []; const seen = new Set<string>();
 for (const entry of commands) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Pi returned an invalid command.");
  const id = clean(entry.name, 200); const source = entry.source;
  if (!id || /\s/.test(id) || id.startsWith("/") || !["extension", "prompt", "skill"].includes(source)) throw new Error("Pi returned an invalid command identity.");
  if (seen.has(id)) throw new Error("Pi returned ambiguous command identities."); seen.add(id);
  const kind = source === "skill" ? "skill" : "command"; const name = kind === "skill" ? id.startsWith("skill:") ? id.slice(6) : "" : id;
  if (!name) throw new Error("Pi returned an invalid skill identity.");
  const path = entry.sourceInfo && typeof entry.sourceInfo === "object" ? clean(entry.sourceInfo.path, 4000) : undefined;
  actions.push({ kind, id, name, description: typeof entry.description === "string" ? entry.description.slice(0, 1000) : "", ...(path ? { path } : {}) });
 }
 return { actions: actions.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)) };
}
export async function piNativeActions(cwd: string, signal: AbortSignal): Promise<NativeActionCatalog> {
 signal.throwIfAborted(); const child = await spawnNative("pi", ["--mode", "rpc", "--no-tools", "--no-session"], cwd, piEntries);
 const rpc = new PiRpc(child.stdout, child.stdin); child.stderr.resume(); child.on("error", error => rpc.close(error)); child.on("exit", () => rpc.close());
 const abort = () => { rpc.close(new Error("Pi command discovery cancelled.")); child.kill(); }; signal.addEventListener("abort", abort, { once: true });
 try { if (signal.aborted) abort(); return piNativeActionCatalog(await rpc.request({ type: "get_commands" }, 15000)); }
 finally { signal.removeEventListener("abort", abort); rpc.close(); child.stdin.end(); child.kill(); }
}
