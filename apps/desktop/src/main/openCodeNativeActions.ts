import type { OpenCodeClient } from "@opencode/client";
import type { NativeActionCatalog, NativeActionEntry } from "../shared/nativeActions";
function text(value: unknown, max: number) { return typeof value === "string" && value.length <= max && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ? value : undefined; }
export async function openCodeNativeActions(client: Pick<OpenCodeClient, "command" | "skill">, cwd: string, signal: AbortSignal): Promise<NativeActionCatalog> {
 const options = { signal }; const [commands, skills] = await Promise.all([client.command.list({ location: { directory: cwd } }, options), client.skill.list({ location: { directory: cwd } }, options)]);
 if (!Array.isArray(commands.data) || !Array.isArray(skills.data) || commands.data.length + skills.data.length > 1000) throw new Error("Native action catalog is invalid or exceeds 1,000 entries.");
 const actions: NativeActionEntry[] = []; const seen = new Set<string>();
 for (const [kind, entries] of [["command", commands.data], ["skill", skills.data]] as const) for (const entry of entries) {
  const name = text(entry.name, 200); const id = kind === "command" ? name : text("id" in entry ? entry.id : undefined, 2000);
  if (!name || !id) throw new Error("Native action catalog contains an invalid identity.");
  const key = `${kind}:${id}`; if (seen.has(key)) throw new Error("Native action catalog contains duplicate identities."); seen.add(key);
  actions.push({ kind, id, name, description: typeof entry.description === "string" ? entry.description.slice(0, 1000) : "", ...(kind === "skill" && "path" in entry && text(entry.path, 4000) ? { path: entry.path } : {}) });
 }
 return { actions: actions.sort((a,b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)) };
}
