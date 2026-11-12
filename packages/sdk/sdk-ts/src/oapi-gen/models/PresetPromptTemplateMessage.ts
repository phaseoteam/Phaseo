export interface PresetPromptTemplateMessage {
  content:
    | string
    | {
        name?: string;
        text?: string;
        type: "text" | "variable";
      }[];
  role: "system" | "developer" | "user" | "assistant";
}
