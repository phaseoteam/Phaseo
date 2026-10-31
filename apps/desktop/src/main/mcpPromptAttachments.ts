import { GetPromptResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { mcpPromptDraft } from "../shared/mcpPrompts";
import type { Attachment } from "../shared/workspace";
import type { AttachmentService } from "./attachments";
import { imageMime } from "./attachments";

export async function importMcpPromptAttachments(taskId: string, value: unknown, service: AttachmentService, commit: (attachments: Attachment[]) => void) {
 if (Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") > 1000000) throw Error("MCP prompt result exceeds the 1 MB limit.");
 const { messages } = GetPromptResultSchema.parse({ messages: value });
 const draft = mcpPromptDraft(messages);
 if (draft.text === undefined) throw Error(draft.insertionError);
 const images = messages.flatMap(({ content }) => content.type === "image" ? [content] : []);
 const files = images.map((image, index) => {
  const bytes = Buffer.from(image.data, "base64");
  if (!bytes.length || bytes.toString("base64") !== image.data) throw Error("This prompt contains an invalid image.");
  if (imageMime(bytes) !== image.mimeType) throw Error("The prompt image does not match its declared format.");
  return { bytes, mimeType: image.mimeType, name: `prompt-image-${index + 1}.${image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.slice(6)}` };
 });
 const attachments: Attachment[] = [];
 try {
  for (const file of files) {
   const attachment = await service.prepare(taskId, file.name, file.bytes); attachments.push(attachment);
   if (attachment.kind !== "image" || attachment.mimeType !== file.mimeType) throw Error("The prompt image does not match its declared format.");
  }
  commit(attachments);
  return { text: draft.text, attachments };
 } catch (error) { await Promise.allSettled(attachments.map(attachment => service.discard(attachment))); throw error; }
}
