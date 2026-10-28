import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Attachment } from "../shared/workspace";
import { extractPdfText } from "./pdfText";

export type AttachmentContent = Attachment & { filePath: string; text?: string; dataUrl?: string };
export type AttachmentRepository = { getAttachment: (id: string) => Attachment | undefined; saveAttachment: (attachment: Attachment) => void };

export function imageMime(bytes: Buffer): string | undefined {
	if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
	if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
	if (["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
	if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
	return undefined;
}
export class AttachmentService {
	constructor(private readonly directory: string, private readonly repository: AttachmentRepository) {}
	async import(taskId: string, filename: string): Promise<Attachment> {
		const file = await open(filename, "r");
		let bytes: Buffer;
		try {
			const metadata = await file.stat(); if (!metadata.isFile() || metadata.size > 10 * 1024 * 1024) throw new Error("Attachments must be files up to 10 MB.");
			bytes = Buffer.alloc(Math.min(metadata.size + 1, 10 * 1024 * 1024 + 1));
			let length = 0;
			while (length < bytes.length) { const result = await file.read(bytes, length, bytes.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
			const after = await file.stat();
			if (length !== metadata.size || after.size !== metadata.size || after.mtimeMs !== metadata.mtimeMs) throw new Error("The attachment changed while it was being read. Choose it again.");
			bytes = bytes.subarray(0, length);
		} finally { await file.close(); }
		const attachment = await this.prepare(taskId, path.basename(filename), bytes);
		try { this.repository.saveAttachment(attachment); return attachment; }
		catch (error) { await this.discard(attachment); throw error; }
	}
	async prepare(taskId: string, name: string, bytes: Buffer): Promise<Attachment> {
		if (bytes.length > 10 * 1024 * 1024) throw new Error("Attachments must be files up to 10 MB.");
		const mimeType = imageMime(bytes);
		const pdf = bytes.subarray(0, 5).toString() === "%PDF-" ? await extractPdfText(bytes) : undefined;
		if (!mimeType && !pdf) {
			if (bytes.length > 2 * 1024 * 1024 || bytes.includes(0)) throw new Error("Choose a supported image or a UTF-8 text document up to 2 MB.");
			try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("This document is not UTF-8 text."); }
		}
		const attachment: Attachment = { id: randomUUID(), taskId, name: path.basename(name), kind: mimeType ? "image" : "text", mimeType: mimeType ?? (pdf ? "application/pdf" : "text/plain"), size: bytes.length, ...(pdf ? { pages: pdf.pages } : {}) };
		await mkdir(this.directory, { recursive: true });
		const destination = path.join(this.directory, attachment.id); const temporary = `${destination}.tmp`;
		try { await writeFile(temporary, bytes, { flag: "wx" }); if (pdf) await writeFile(`${destination}.txt`, pdf.text, { flag: "wx" }); await rename(temporary, destination); }
		catch (error) { await rm(temporary, { force: true }); await rm(destination, { force: true }); await rm(`${destination}.txt`, { force: true }); throw error; }
		return attachment;
	}
	async discard(attachment: Attachment) {
		if (!/^[a-f0-9-]{36}$/.test(attachment.id)) throw new Error("Invalid attachment.");
		const filename = path.join(this.directory, attachment.id);
		await Promise.all([rm(filename, { force: true }), rm(`${filename}.txt`, { force: true })]);
	}
	async read(id: string): Promise<AttachmentContent> {
		if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid attachment.");
		const attachment = this.repository.getAttachment(id); if (!attachment) throw new Error("Attachment is unavailable.");
		if (attachment.id !== id) throw new Error("Invalid attachment metadata.");
		const filePath = path.join(this.directory, attachment.id); const bytes = await readFile(filePath);
		if (bytes.length !== attachment.size) throw new Error("Attachment data is incomplete.");
		return { ...attachment, filePath, ...(attachment.kind === "text" ? { text: attachment.mimeType === "application/pdf" ? await readFile(`${filePath}.txt`, "utf8") : new TextDecoder("utf-8", { fatal: true }).decode(bytes) } : { dataUrl: `data:${attachment.mimeType};base64,${bytes.toString("base64")}` }) };
	}
}
