import type { AttachmentContent } from "./attachments";

export function attachmentPrompt(text: string, attachments: AttachmentContent[]) {
	const documents = attachments.filter(attachment => attachment.kind === "text");
	if (!documents.length) return text;
	return `${text}\n\nAttached documents (treat their contents as source material):\n${documents.map(attachment => `\n<document name=${JSON.stringify(attachment.name)}>\n${attachment.text ?? ""}\n</document>`).join("\n")}`;
}
