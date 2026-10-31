import type { AttachmentContent } from "./attachments";
import type { AgentMessage } from "@phaseo/agent-sdk";
import type { Message } from "../shared/workspace";

export function phaseoConversationMessages(messages: Message[], text: string, attachments: AttachmentContent[], selectedArguments?: string): AgentMessage[] {
	const result: AgentMessage[] = messages.filter(message => message.role === "user" || message.role === "assistant").map(message => {
		const files = attachments.filter(file => message.attachments?.some(value => value.id === file.id));
		const content = attachmentPrompt(selectedArguments !== undefined && message === messages.at(-1) && message.role === "user" ? selectedArguments : message.text, files);
		if (message.role === "assistant") return { role: "assistant", content };
		const images = files.filter(file => file.kind === "image");
		if (images.some(file => !file.dataUrl)) throw new Error("Image attachment data is unavailable.");
		return { role: "user", content: images.length ? [{ type: "text", text: content }, ...images.map(file => ({ type: "image_url" as const, image_url: { url: file.dataUrl! } }))] : content };
	});
	if (messages.at(-1)?.role !== "user" || messages.at(-1)?.text !== text) result.push({ role: "user", content: selectedArguments ?? text });
	return result;
}

export function attachmentPrompt(text: string, attachments: AttachmentContent[]) {
	const documents = attachments.filter(attachment => attachment.kind === "text");
	if (!documents.length) return text;
	return `${text}\n\nAttached documents (treat their contents as source material):\n${documents.map(attachment => `\n<document name=${JSON.stringify(attachment.name)}>\n${attachment.text ?? ""}\n</document>`).join("\n")}`;
}
