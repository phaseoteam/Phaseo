export interface ActivityEntry {
  cost_cents?: number;
  endpoint?: string;
  latency_ms?: number;
  model?: string;
  provider?: string;
  request_id?: string;
  timestamp?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
}
