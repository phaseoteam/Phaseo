export interface ChatCompletionsStreamChoice {
  delta?: {
    content?: string;
    reasoning_content?: string;
    role?: string;
    tool_calls?: {
      [key: string]: unknown;
    }[];
    [key: string]: unknown;
  };
  finish_reason?: string;
  index?: number;
  logprobs?: {};
  [key: string]: unknown;
}
