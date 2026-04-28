export interface WorkspaceActivityResponse {
  activity: {
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
  }[];
  limit: number;
  offset: number;
  ok: true;
  period_days: number;
  total: number;
  total_cost_cents: number;
}
