import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AttachmentService } from "./attachments";
import { WorkspaceStore } from "./workspaceStore";
import { importMcpPromptAttachments } from "./mcpPromptAttachments";
import { mcpPromptDraft } from "../shared/mcpPrompts";
import { phaseoConversationMessages } from "./attachmentPrompt";
const pixels = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3n8AAAAASUVORK5CYII=";
const image = { role: "user" as const, content: { type: "image" as const, mimeType: "image/png", data: pixels } };
describe("MCP prompt attachment insertion", () => {
 it("retains real image bytes, ordered role markers and queued ownership after SQLite reopening", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-prompt-images-")), database = path.join(root, "workspace.sqlite"); let store = new WorkspaceStore(database);
  try {
   const task = store.apply({ type: "create-task", harness: "opencode", mode: "chat", model: "default" });
   const service = new AttachmentService(path.join(root, "attachments"), store);
   const result = await importMcpPromptAttachments(task.id, [{ role: "user", content: { type: "text", text: "Inspect" } }, image, { role: "assistant", content: { type: "text", text: "Example" } }], service, files => store.saveAttachments(files));
   expect(result.text).toBe("User:\nInspect\n\nUser:\n[Image: prompt-image-1.png]\n\nAssistant:\nExample");
   expect(result.attachments).toHaveLength(1); expect(result.attachments[0].taskId).toBe(task.id);
   store.apply({ type: "send", id: task.id, text: result.text, attachments: result.attachments.map(file => file.id) });
   store.close(); store = new WorkspaceStore(database);
   expect(store.getTask(task.id).queue[0].attachments).toEqual(result.attachments);
   const content = await new AttachmentService(path.join(root, "attachments"), store).read(result.attachments[0].id);
   expect(content.dataUrl).toBe(`data:image/png;base64,${pixels}`);
   const queued = store.getTask(task.id).queue[0];
   expect(phaseoConversationMessages([{ ...queued, role: "user" }], queued.text, [content])).toEqual([{ role: "user", content: [{ type: "text", text: result.text }, { type: "image_url", image_url: { url: content.dataUrl } }] }]);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
 it("rejects unsupported content, invalid base64, MIME mismatch and excess images before preparing files", async () => {
  const service = { prepare: () => { throw Error("Unexpected preparation"); } } as unknown as AttachmentService;
  for (const [messages, error] of [[[{ ...image, content: { ...image.content, data: "garbage" } }], "invalid image"], [[{ ...image, content: { ...image.content, mimeType: "image/jpeg" } }], "declared format"], [Array(11).fill(image), "10 images"], [[{ role: "user", content: { type: "audio", data: pixels, mimeType: "audio/wav" } }], "unsupported"], [[{ role: "user", content: { type: "text", text: "x".repeat(1000001) } }], "1 MB"]] as const) await expect(importMcpPromptAttachments("task", messages, service, () => { throw Error("Unexpected commit"); })).rejects.toThrow(error);
 });
 it("cleans every prepared snapshot when committing fails", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "phaseo-prompt-rollback-")); const store = new WorkspaceStore(":memory:");
  try {
   const service = new AttachmentService(root, store);
   await expect(importMcpPromptAttachments("task", [image, image], service, () => { throw Error("Owned commit failure"); })).rejects.toThrow("Owned commit failure");
   expect(readdirSync(root)).toEqual([]);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
 });
 it("rolls back all metadata when a later attachment insert fails", () => {
  const store = new WorkspaceStore(":memory:");
  try {
   const attachment = { id: "12345678-1234-1234-1234-123456789abc", taskId: "task", name: "owned.png", kind: "image" as const, mimeType: "image/png", size: 1 };
   store.saveAttachment(attachment); const fresh = { ...attachment, id: "87654321-1234-1234-1234-123456789abc" };
   expect(() => store.saveAttachments([fresh, attachment])).toThrow(); expect(store.getAttachment(fresh.id)).toBeUndefined(); expect(store.getAttachment(attachment.id)).toEqual(attachment);
  } finally { store.close(); }
 });
 it("preserves embedded text as labelled source material without fetching its URI", () => {
  expect(mcpPromptDraft([{ role: "user", content: { type: "resource", resource: { uri: "https://owned.invalid/notes", text: "Source material" } } }])).toEqual({ text: '<resource uri="https://owned.invalid/notes">\nSource material\n</resource>', imageCount: 0 });
 });
});
