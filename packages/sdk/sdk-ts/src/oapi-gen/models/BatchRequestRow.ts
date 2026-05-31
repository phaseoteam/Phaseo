export interface BatchRequestRow {
  completed_at?: string | null;
  cost_nanos?: number | null;
  cost_usd?: number | null;
  created_at?: string | null;
  custom_id?: string;
  endpoint?: string | null;
  error_body?: {
    [key: string]: unknown;
  } | null;
  id?: string;
  meta?: {
    [key: string]: unknown;
  };
  method?: string | null;
  model?: string | null;
  native_batch_id?: string | null;
  provider?: string;
  request_body_hash?: string | null;
  request_index?: number;
  response_body?: {
    [key: string]: unknown;
  } | null;
  response_status?: number | null;
  status?: string;
  updated_at?: string | null;
  usage?: {
    [key: string]: unknown;
  } | null;
}
