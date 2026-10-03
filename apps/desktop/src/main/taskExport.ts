import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Task } from "../shared/workspace";
import type { AttachmentContent, AttachmentService } from "./attachments";

export type TaskExportFormat = "markdown" | "json";

export function exportFilename(title: string, format: TaskExportFormat) {
	const cleaned = Array.from(title, character => character.charCodeAt(0) < 32 ? "-" : character).join("").replace(/[<>:"/\\|?*]/g, "-").slice(0, 100).trim().replace(/[. ]+$/g, "");
	const name = !cleaned || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(cleaned) ? "Conversation" : cleaned;
	return `${name}.${format === "markdown" ? "md" : "json"}`;
}

const heading = (value: string) => value.replace(/[\r\n]+/g, " ").replace(/[\\`*_{}[\]()#+.!<>]/g, "\\$&");
const block = (text: string) => { let longest = 2; for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length); const fence = "`".repeat(longest + 1); return `${fence}\n${text}\n${fence}`; };

export async function taskExport(task: Task, format: TaskExportFormat, attachments: Pick<AttachmentService, "read">): Promise<string> {
	const referenced = new Map(task.messages.flatMap(message => message.attachments ?? []).map(attachment => [attachment.id, attachment]));
	if ([...referenced.values()].reduce((size, attachment) => size + attachment.size, 0) > 100 * 1024 * 1024) throw new Error("This export exceeds the 100 MB attachment limit.");
	const contents = new Map<string, AttachmentContent>();
	for (const id of referenced.keys()) contents.set(id, await attachments.read(id));
	if (format === "json") {
		const files = [];
		for (const attachment of contents.values()) {
			const bytes = await readFile(attachment.filePath);
			if (bytes.length !== attachment.size) throw new Error("Attachment data is incomplete.");
			files.push({ id: attachment.id, name: attachment.name, kind: attachment.kind, mimeType: attachment.mimeType, size: bytes.length, pages: attachment.pages, encoding: "base64", data: bytes.toString("base64"), ...(attachment.text !== undefined ? { text: attachment.text } : {}) });
		}
		return JSON.stringify({ format: "phaseo-conversation", version: 1, exportedAt: new Date().toISOString(), title: task.title, harness: task.harness, model: task.model, mode: task.mode, createdAt: task.createdAt, messages: task.messages.map(message => ({ role: message.role, text: message.text, createdAt: message.createdAt, delivery: message.delivery, attachments: message.attachments?.map(attachment => attachment.id) })), attachments: files }, null, 2) + "\n";
	}
	const sections = [`# ${heading(task.title)}`, `${heading(task.harness)} · ${heading(task.model)} · ${task.mode}`];
	for (const message of task.messages) {
		sections.push(`## ${message.role === "user" ? "You" : message.role === "assistant" ? heading(task.harness) : heading(message.role)}${message.delivery === "steer" ? " — Steering instruction" : ""}`, message.text);
		for (const reference of message.attachments ?? []) {
			const attachment = contents.get(reference.id)!;
			sections.push(`### Attachment: ${heading(attachment.name)}`, attachment.kind === "image" ? `![${heading(attachment.name)}](${attachment.dataUrl})` : block(attachment.text ?? ""));
		}
	}
	return sections.join("\n\n") + "\n";
}

/** Replacing only after a complete write preserves an existing export on failure. */
export async function saveTaskExport(filename: string, content: string) {
	const temporary = path.join(path.dirname(filename), `.phaseo-export-${randomUUID()}.tmp`);
	try { await writeFile(temporary, content, { encoding: "utf8", flag: "wx" }); await rename(temporary, filename); }
	finally { await rm(temporary, { force: true }); }
}
