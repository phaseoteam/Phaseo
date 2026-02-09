export interface ResponsesRequest {
  background?: boolean;
  conversation?: string | {};
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  include?: string[];
  input?: {};
  input_items?: {}[];
  instructions?: string;
  max_output_tokens?: number;
  max_tool_calls?: number;
  meta?: boolean;
  metadata?: {
    [key: string]: string;
  };
  model: string;
  parallel_tool_calls?: boolean;
  previous_response_id?: string;
  prompt?: {
    id?: string;
    variables?: {};
    version?: string;
  };
  prompt_cache_key?: string;
  prompt_cache_retention?: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  reasoning?: {
    effort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
    summary?: string;
  };
  safety_identifier?: string;
  service_tier?: string;
  store?: boolean;
  stream?: boolean;
  stream_options?: {};
  temperature?: number;
  text?: {};
  tool_choice?: string | {};
  tools?: {}[];
  top_logprobs?: number;
  top_p?: number;
  truncation?: string;
  usage?: boolean;
  user?: string;
}
