export interface InteractionContentBlock {
  data?: string;
  mime_type?: string;
  text?: string;
  type: "text" | "image" | "audio" | "video" | "document";
  uri?: string;
  [key: string]: unknown;
}
