import { constants } from "node:fs";
import { open, opendir } from "node:fs/promises";
import { parse } from "yaml";
import { resolveProjectPath } from "./projectFiles";
import { contentHash } from "./projectEdits";
import type { NativeAction, NativeActionEntry } from "../shared/nativeActions";
import type { AgentCallbacks } from "./agentAdapter";
import { AgentInputRejectedError } from "./agentAdapter";
import { validateNativeAction } from "../shared/nativeActions";

export function restoredPhaseoSkill(context: unknown, argumentsValue: string): NativeAction | undefined {
 if (!context || typeof context !== "object" || !("phaseoSkill" in context)) return undefined;
 const value = (context as { phaseoSkill: unknown }).phaseoSkill;
 try {
  if (!value || typeof value !== "object") throw new Error("Invalid saved skill context.");
  const identity = value as { id: unknown; name: unknown };
  return validateNativeAction({ kind: "skill", id: identity.id, name: identity.name, arguments: argumentsValue });
 } catch (error) { throw new AgentInputRejectedError("Saved Phaseo skill context is invalid; input was not submitted.", { cause: error }); }
}

type Skill = NativeActionEntry & { content: string; hash: string; enabled: boolean; userInvocable: boolean; modelInvocable: boolean };
const validName = (name: string) => name.length <= 64 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
function policyBoolean(value: unknown, fallback: boolean) {
 if (value === undefined) return fallback;
 if (typeof value === "boolean") return value;
 if (typeof value === "string") { if (["true", "yes", "on", "y", "1"].includes(value.toLowerCase())) return true; if (["false", "no", "off", "n", "0"].includes(value.toLowerCase())) return false; }
 throw new Error("Skill invocation policies must be boolean values.");
}
export class PhaseoSkills {
 constructor(private readonly workspaceRoot: string, private readonly projectRoot?: string) {}
 private location(scope: string) {
  if (scope === "global") return { root: this.workspaceRoot, directory: "skills" };
  if (scope === "project" && this.projectRoot) return { root: this.projectRoot, directory: ".phaseo/skills" };
  if (scope === "agents" && this.projectRoot) return { root: this.projectRoot, directory: ".agents/skills" };
  throw new Error("Skill scope is unavailable.");
 }
 instructionReader(approved: Skill, signal: AbortSignal) {
  let initial = true;
  return async () => {
   signal.throwIfAborted(); const current = await this.read(approved.id); signal.throwIfAborted();
   if (!current.enabled || !current.userInvocable) throw new Error("This skill is unavailable for user activation.");
   if (initial && (current.hash !== approved.hash || current.path !== approved.path)) throw new Error("Skill changed after approval. Review it again before running.");
   initial = false; return { path: current.path!, text: current.content };
  };
 }
 async approve(action: NativeAction, callbacks: AgentCallbacks, signal: AbortSignal): Promise<Skill> {
  try {
   signal.throwIfAborted(); if (action.kind !== "skill") throw new Error("Phaseo supports registered skills through this picker.");
   const skill = await this.read(action.id); if (skill.name !== action.name) throw new Error("The selected skill identity changed.");
   if (!skill.enabled || !skill.userInvocable) throw new Error("This skill is unavailable for user activation.");
   if (await callbacks.onApproval(`Use Phaseo skill ${skill.name}`, `${skill.path}\n\n${skill.content}\n\nTask: ${action.arguments}`) !== "accept") throw new Error("Skill activation declined.");
   signal.throwIfAborted(); const current = await this.read(action.id); if (current.hash !== skill.hash || current.path !== skill.path) throw new Error("Skill changed during approval. Review it again before running.");
   signal.throwIfAborted(); return current;
  } catch (error) { throw new AgentInputRejectedError(error instanceof Error ? error.message : "Skill activation failed.", { cause: error }); }
 }
 async read(id: string): Promise<Skill> {
  const match = /^(global|project|agents):([a-z0-9-]+)$/.exec(id);
  if (!match || !validName(match[2])) throw new Error("Invalid skill identity.");
  const { root, directory } = this.location(match[1]), name = match[2];
  const filename = await resolveProjectPath(root, `${directory}/${name}/SKILL.md`);
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
   const before = await file.stat(); if (!before.isFile() || before.size > 16 * 1024) throw new Error("Skill files must be UTF-8 text up to 16 KiB.");
   const bytes = Buffer.alloc(16 * 1024 + 1); let length = 0;
   while (length < bytes.length) { const value = await file.read(bytes, length, bytes.length - length, length); if (!value.bytesRead) break; length += value.bytesRead; }
   const after = await file.stat(); if (length > 16 * 1024 || bytes.subarray(0, length).includes(0)) throw new Error("Skill files must be UTF-8 text up to 16 KiB.");
   if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Skill changed while loading.");
   const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
   const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source.replace(/^\uFEFF/, ""));
   if (!frontmatter) throw new Error("Skill requires YAML name and description frontmatter.");
   const metadata: unknown = parse(frontmatter[1], { schema: "failsafe", maxAliasCount: 0, logLevel: "error" });
   if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Invalid skill frontmatter.");
   const fields = metadata as Record<string, unknown>;
   if (fields.name !== name || typeof fields.description !== "string" || !fields.description.trim() || fields.description.length > 1024 || !frontmatter[2].trim()) throw new Error("Skill name must match its folder, with a description and nonempty instructions.");
   return { kind: "skill", id, name, description: fields.description, path: filename, content: frontmatter[2].trim(), hash: contentHash(source), enabled: policyBoolean(fields.enabled, true), userInvocable: policyBoolean(fields["user-invocable"], true), modelInvocable: !policyBoolean(fields["disable-model-invocation"], false) };
  } finally { await file.close(); }
 }
 async catalog(signal?: AbortSignal, invocation: "user" | "model" = "user"): Promise<{ actions: NativeActionEntry[]; errors: string[] }> {
  signal?.throwIfAborted();
  const actions: NativeActionEntry[] = [], errors: string[] = []; let inspected = 0, definitions = 0;
  for (const scope of this.projectRoot ? ["project", "agents", "global"] : ["global"]) {
   const { root, directory } = this.location(scope); const names: string[] = [];
   try { const entries = await opendir(await resolveProjectPath(root, directory)); for await (const entry of entries) { signal?.throwIfAborted(); if (++inspected > 1000) throw new Error("Skill discovery exceeds 1,000 entries."); if (entry.isDirectory() || entry.isSymbolicLink()) names.push(entry.name); } }
   catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
   for (const name of names.sort()) {
    signal?.throwIfAborted();
    if (++definitions > 200) throw new Error("Skill catalog exceeds 200 definitions.");
    try { const skill = await this.read(`${scope}:${name}`); if (skill.enabled && (invocation === "user" ? skill.userInvocable : skill.modelInvocable)) actions.push({ kind: skill.kind, id: skill.id, name: skill.name, description: skill.description, path: skill.path }); }
    catch (error) { errors.push(`${scope}/${name}: ${error instanceof Error ? error.message.slice(0, 500) : "Could not load skill."}`); }
   }
  }
  return { actions, errors };
 }
}
