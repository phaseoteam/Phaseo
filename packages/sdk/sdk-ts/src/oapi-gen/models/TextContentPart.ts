export interface TextContentPart {
  cache_control?: {
    scope?: string;
    ttl?: string;
    type?: string;
    [key: string]: unknown;
  };
  prompt_cache_breakpoint?: {
    mode?: "explicit";
    [key: string]: unknown;
  };
  text: string;
  type: "text";
}
