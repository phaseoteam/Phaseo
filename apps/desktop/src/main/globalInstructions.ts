import { ProjectInstructions } from "./projectInstructions";
import { contentHash, writeProjectFile } from "./projectEdits";
import type { InstructionDocument } from "../shared/instructions";

export class GlobalInstructions {
 private pending = Promise.resolve();
 constructor(private readonly root: string) {}
 async read(): Promise<InstructionDocument> {
  const instructions = new ProjectInstructions(this.root); await instructions.load(".", true);
  const entry = instructions.list()[0]; return entry ? { content: entry.text, hash: contentHash(entry.text) } : { content: "", hash: "new" };
 }
 async save(value: unknown): Promise<InstructionDocument> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid instruction edit.");
  const edit = value as { content?: unknown; expectedHash?: unknown };
  if (typeof edit.content !== "string" || Buffer.byteLength(edit.content) > 16 * 1024 || edit.content.includes("\0") || Buffer.from(edit.content).toString("utf8") !== edit.content || typeof edit.expectedHash !== "string" || (edit.expectedHash !== "new" && !/^[a-f0-9]{64}$/.test(edit.expectedHash))) throw new Error("Instructions must be UTF-8 text up to 16 KiB with a valid revision.");
  const content = edit.content, expectedHash = edit.expectedHash;
  const operation = this.pending.then(async () => { const current = await this.read(); if (current.hash !== expectedHash) throw new Error("Instructions changed since they were loaded. Reload before saving."); await writeProjectFile(this.root, "AGENTS.md", content, expectedHash); return this.read(); });
  this.pending = operation.then(() => {}, () => {}); return operation;
 }
}
