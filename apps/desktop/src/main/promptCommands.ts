import { constants } from "node:fs";
import { mkdir, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "yaml";
import { contentHash, writeProjectFile } from "./projectEdits";
import { resolveProjectPath } from "./projectFiles";
import { expandPromptCommand, type PromptCommandCatalog, type PromptCommandPreview, type PromptCommandRequest } from "../shared/promptCommands";
const limit = 16 * 1024;
function nameValid(name: unknown): name is string { return typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(name); }
export class PromptCommands {
 constructor(private readonly globalRoot: string, private readonly projectRoot?: string) {}
 private root(scope: unknown) { if (scope === "global") return { root: this.globalRoot, directory: "commands" }; if (scope === "project" && this.projectRoot) return { root: this.projectRoot, directory: ".phaseo/commands" }; throw new Error("Command scope is unavailable."); }
 private async read(scope: "global" | "project", name: string): Promise<PromptCommandPreview> {
  const { root, directory } = this.root(scope); const filename = await resolveProjectPath(root, `${directory}/${name}.md`);
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
   const before = await file.stat(); if (!before.isFile() || before.size > limit) throw new Error("Command files must be text up to 16 KiB.");
   const bytes = Buffer.alloc(limit + 1); let length = 0;
   while (length < bytes.length) { const result = await file.read(bytes, length, bytes.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
   const after = await file.stat(); if (length > limit || bytes.subarray(0, length).includes(0)) throw new Error("Command files must be text up to 16 KiB.");
   if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("Command changed while loading.");
   const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length)); const markdown = source.replace(/^\uFEFF/, ""); let template = markdown, description = "";
   if (markdown.startsWith("---\n") || markdown.startsWith("---\r\n")) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown); if (!match) throw new Error("Command frontmatter is incomplete.");
    const data: unknown = parse(match[1], { schema: "failsafe", maxAliasCount: 0, logLevel: "error" }) ?? {};
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => key !== "description")) throw new Error("Command frontmatter supports description only.");
    const value = (data as Record<string, unknown>).description; if (value !== undefined && (typeof value !== "string" || value.length > 240)) throw new Error("Command description must be text up to 240 characters.");
    description = typeof value === "string" ? value : ""; template = match[2];
   }
   if (!template.trim()) throw new Error("Command template is empty.");
   if (/!`[^`]*`/.test(template)) throw new Error("Shell interpolation is unavailable in saved prompt commands.");
   return { scope, name, description, hash: contentHash(source), template: template.trim(), text: template.trim() };
  } finally { await file.close(); }
 }
 async list(): Promise<PromptCommandCatalog> {
  const catalog: PromptCommandCatalog = { commands: [], errors: [] }; let total = 0;
  for (const scope of ["global", ...(this.projectRoot ? ["project"] : [])] as ("global" | "project")[]) {
   const { root, directory } = this.root(scope); const names: string[] = [];
   try { const entries = await opendir(await resolveProjectPath(root, directory)); let inspected = 0; for await (const entry of entries) { if (++inspected > 1000) throw new Error("Command directory exceeds 1,000 entries."); if (entry.name.endsWith(".md")) names.push(entry.name); } }
   catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw new Error(`Could not load ${scope} commands.`, { cause: error }); }
   names.sort(); total += names.length; if (total > 200) throw new Error("Command catalog exceeds 200 files.");
   for (const filename of names) {
    const name = filename.slice(0, -3); if (!nameValid(name)) { catalog.errors.push(`${scope}/${filename}: use a lowercase command name with letters, numbers and hyphens.`); continue; }
    try { const command = await this.read(scope, name); catalog.commands.push({ scope, name, description: command.description, hash: command.hash }); }
    catch (error) { catalog.errors.push(`${scope}/${filename}: ${error instanceof Error ? error.message.slice(0, 500) : "Could not load command."}`); }
   }
  }
  return catalog;
 }
 async request(value: unknown): Promise<PromptCommandCatalog | PromptCommandPreview> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid command request.");
  const request = value as PromptCommandRequest; if (request.type === "list") return this.list();
  if (!nameValid(request.name)) throw new Error("Use a lowercase command name with letters, numbers and hyphens."); this.root(request.scope);
  if (request.type === "preview") {
   if (typeof request.arguments !== "string" || request.arguments.length > 10000) throw new Error("Command arguments exceed 10,000 characters.");
   const command = await this.read(request.scope, request.name); return { ...command, text: expandPromptCommand(command.template, request.arguments) };
  }
  if (request.type !== "save" || typeof request.description !== "string" || request.description.length > 240 || typeof request.template !== "string" || !request.template.trim() || typeof request.expectedHash !== "string") throw new Error("Invalid command fields.");
  if (request.template.includes("\0") || request.description.includes("\0")) throw new Error("Command fields must contain text.");
  if (/!`[^`]*`/.test(request.template)) throw new Error("Shell interpolation is unavailable in saved prompt commands.");
  const source = `---\n${stringify({ description: request.description })}---\n${request.template.trim()}\n`; if (Buffer.byteLength(source) > limit) throw new Error("Command files must be text up to 16 KiB.");
  const { root, directory } = this.root(request.scope); await realpath(root);
  // Resolve each directory after creating it, before writing any command content.
  let current = ""; for (const part of directory.split("/")) { current = path.posix.join(current, part); try { await resolveProjectPath(root, current); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await mkdir(path.join(root, current)); await resolveProjectPath(root, current); } }
  await writeProjectFile(root, `${directory}/${request.name}.md`, source, request.expectedHash); return this.read(request.scope, request.name);
 }
}
