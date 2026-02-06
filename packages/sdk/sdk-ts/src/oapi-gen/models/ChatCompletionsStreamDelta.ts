export interface ChatCompletionsStreamDelta {
  content?: string;
  reasoning_content?: string;
  role?: string;
  tool_calls?: {
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}
