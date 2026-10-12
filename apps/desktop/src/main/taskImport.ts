import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import { harnesses, type Harness, type Message } from "../shared/workspace";

export type ImportedConversation = { title: string; harness: Harness; createdAt: string; messages: (Omit<Message, "attachments"> & { attachments?: string[] })[]; attachments: { id: string; name: string; bytes: Buffer }[] };
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid conversation export."); return value as Record<string, unknown>; };
const text = (value: unknown, maximum: number) => { if (typeof value !== "string" || value.length > maximum) throw new Error("Invalid conversation text."); return value; };
const date = (value: unknown) => { const result = text(value, 100); if (!Number.isFinite(Date.parse(result))) throw new Error("Invalid conversation date."); return result; };

export function parseConversation(content: string): ImportedConversation {
	if (Buffer.byteLength(content) > 200 * 1024 * 1024) throw new Error("Conversation exports must be up to 200 MB.");
	const source = object(JSON.parse(content));
	if (source.format !== "phaseo-conversation" || source.version !== 1 || !harnesses.includes(source.harness as Harness)) throw new Error("Choose a supported Phaseo conversation export.");
	if (!Array.isArray(source.messages) || source.messages.length > 10000 || !Array.isArray(source.attachments) || source.attachments.length > 1000) throw new Error("Invalid conversation contents.");
	let total = 0; const ids = new Set<string>();
	const attachments = source.attachments.map(value => {
		const file = object(value); const id = text(file.id, 100); const name = text(file.name, 200); const encoded = text(file.data, Math.ceil(10 * 1024 * 1024 / 3) * 4);
		if (!id || !name || ids.has(id) || file.encoding !== "base64" || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4) throw new Error("Invalid exported attachment.");
		const bytes = Buffer.from(encoded, "base64"); total += bytes.length;
		if (bytes.length > 10 * 1024 * 1024 || bytes.toString("base64") !== encoded || total > 100 * 1024 * 1024) throw new Error("Exported attachments exceed their size limit or contain invalid data.");
		ids.add(id); return { id, name, bytes };
	});
	const messages = source.messages.map(value => {
		const message = object(value);
		if (!["user", "assistant", "system", "tool"].includes(String(message.role)) || (message.delivery !== undefined && message.delivery !== "steer")) throw new Error("Invalid conversation message.");
		if (message.attachments !== undefined && (!Array.isArray(message.attachments) || message.attachments.length > 10 || message.attachments.some(id => typeof id !== "string" || !ids.has(id)))) throw new Error("A conversation attachment is missing.");
		return { id: randomUUID(), role: message.role as Message["role"], text: text(message.text, 10 * 1024 * 1024), createdAt: date(message.createdAt), ...(message.delivery === "steer" ? { delivery: "steer" as const } : {}), attachments: message.attachments as string[] | undefined };
	});
	return { title: text(source.title, 200), harness: source.harness as Harness, createdAt: date(source.createdAt), messages, attachments };
}

export async function readConversation(filename: string) {
	const file = await open(filename, "r");
	try {
		const before = await file.stat(); if (!before.isFile() || before.size > 200 * 1024 * 1024) throw new Error("Choose a conversation export up to 200 MB.");
		const bytes = Buffer.alloc(before.size + 1); let length = 0;
		while (length < bytes.length) { const read = await file.read(bytes, length, bytes.length - length, length); if (!read.bytesRead) break; length += read.bytesRead; }
		const after = await file.stat(); if (length !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("The conversation export changed while being read.");
		return parseConversation(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
	} finally { await file.close(); }
}
