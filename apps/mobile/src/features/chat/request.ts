import { settingsRequestFields, systemPromptFor, type ModelSettings, type RequestCapabilities } from "./settings";

export type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } } | { type: "input_audio"; input_audio: { data: string; format: string } };
export type WireMessage = { role: "system" | "user" | "assistant"; content: string | ContentPart[] };

/** The input_audio formats OpenAI-compatible chat routes take; other recordings are refused when picked (attachments.ts). */
export const AUDIO_FORMATS = ["mp3", "wav"];

/** input_audio's format from the file type ("audio/mpeg" → "mp3", "audio/x-wav" → "wav"), else the file extension. */
export function audioFormat(mimeType: string, name: string) {
  const subtype = mimeType.toLowerCase().split("/")[1]?.split(";")[0]?.replace(/^x-/, "").trim();
  const fromType = subtype === "mpeg" || subtype === "mp3" ? "mp3" : subtype === "wav" || subtype === "wave" ? "wav" : null;
  return fromType ?? name.split(".").at(-1)?.toLowerCase() ?? "";
}

/** The chat-completions body for one model: its system prompt first, then the thread, then its settings. */
export function buildRequestBody(args: { model: string; messages: WireMessage[]; settings?: ModelSettings; capabilities?: RequestCapabilities }) {
  const system = systemPromptFor(args.settings);
  return {
    model: args.model,
    messages: system ? [{ role: "system" as const, content: system }, ...args.messages] : args.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...settingsRequestFields(args.settings, args.capabilities),
  };
}

/** The request body with message text and attachments shortened, for the opt-in debug log. */
export function loggableRequest(body: ReturnType<typeof buildRequestBody>) {
  const clip = (value: string) => (value.length > 160 ? `${value.slice(0, 160)}…` : value);
  return { ...body, messages: body.messages.map((message) => ({ ...message, content: typeof message.content === "string" ? clip(message.content) : message.content.map((part) => (part.type === "text" ? { ...part, text: clip(part.text) } : { type: part.type, omitted: true })) })) };
}
