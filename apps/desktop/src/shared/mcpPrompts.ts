import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
export type McpPromptEntry = { connectionId: string; server: string; name: string; description: string; arguments: { name: string; description?: string; required?: boolean }[] };
export type McpPromptCatalog = { prompts: McpPromptEntry[] };
export type McpPromptPreview = { server: string; name: string; description?: string; messages: GetPromptResult["messages"]; text?: string; insertionError?: string };
export type McpPromptRequest = ({ type: "list" } | { type: "preview"; connectionId: string; name: string; arguments: Record<string, string> } | { type: "cancel" }) & { requestId: string };
export function mcpPromptDraft(messages: GetPromptResult["messages"]): { text?: string; insertionError?: string } {
 if (messages.some(message => message.content.type !== "text")) return { insertionError: "This prompt contains media. Media insertion is unavailable." };
 const labelled = messages.some(message => message.role === "assistant");
 const text = messages.map(message => message.content.type === "text" ? `${labelled ? `${message.role === "assistant" ? "Assistant" : "User"}:\n` : ""}${message.content.text}` : "").join("\n\n");
 if (!text.trim()) return { insertionError: "This prompt has no text to insert." };
 if (text.length > 100000) return { insertionError: "This prompt exceeds the chat draft limit." };
 return { text };
}
