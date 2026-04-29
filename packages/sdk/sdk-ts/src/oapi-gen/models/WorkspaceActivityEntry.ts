export interface WorkspaceActivityEntry {
  cost_cents: number;
  endpoint: string | null;
  latency_ms: number | null;
  model: string | null;
  provider: string | null;
  request_id: string | null;
  timestamp: string | null;
  usage: {
    [key: string]: unknown;
  } | null;
}
