import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
export type McpPromptEntry = { connectionId: string; server: string; name: string; description: string; arguments: { name: string; description?: string; required?: boolean }[] };
export type McpPromptCatalog = { prompts: McpPromptEntry[] };
export type McpPromptPreview = { server: string; name: string; description?: string; messages: GetPromptResult["messages"]; text?: string; imageCount?: number; insertionError?: string };
export type McpPromptRequest = ({ type: "list" } | { type: "preview"; connectionId: string; name: string; arguments: Record<string, string> } | { type: "cancel" }) & { requestId: string };
export function mcpPromptDraft(messages: GetPromptResult["messages"]): { text?: string; imageCount?: number; insertionError?: string } {
 if (messages.some(({ content }) => content.type !== "text" && !(content.type === "image" && ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(content.mimeType)) && !(content.type === "resource" && "text" in content.resource))) return { insertionError: "This prompt contains unsupported media or resources. Insertion is unavailable." };
 const imageCount = messages.filter(message => message.content.type === "image").length;
 if (imageCount > 10) return { insertionError: "Only 10 images can be attached to one message." };
 const labelled = messages.some(message => message.role === "assistant");
 let imageIndex = 0;
 const text = messages.map(({ role, content }) => {
  const value = content.type === "text" ? content.text : content.type === "image" ? `[Image: prompt-image-${++imageIndex}.${content.mimeType === "image/jpeg" ? "jpg" : content.mimeType.slice(6)}]` : content.type === "resource" && "text" in content.resource ? `<resource uri=${JSON.stringify(content.resource.uri)}>\n${content.resource.text}\n</resource>` : "";
  return `${labelled ? `${role === "assistant" ? "Assistant" : "User"}:\n` : ""}${value}`;
 }).join("\n\n");
 if (!text.trim()) return { insertionError: "This prompt has no text to insert." };
 if (text.length > 100000) return { insertionError: "This prompt exceeds the chat draft limit." };
 return { text, imageCount };
}
