export interface ResponsesInputTextItem {
  cache_control?: {
    cache?: {
      ttl?: "5m" | "1h";
      type?: "ehpemeral" | "ephemeral";
    };
    ttl?: "5m" | "1h";
    type?: "ehpemeral" | "ephemeral";
  };
  text: string;
  type: "input_text";
}
