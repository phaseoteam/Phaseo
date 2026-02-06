export interface TextContentPart {
  cache_control?: {
    cache?: {
      ttl?: "5m" | "1h";
      type?: "ehpemeral" | "ephemeral";
    };
    ttl?: "5m" | "1h";
    type?: "ehpemeral" | "ephemeral";
  };
  text: string;
  type: "text";
}
