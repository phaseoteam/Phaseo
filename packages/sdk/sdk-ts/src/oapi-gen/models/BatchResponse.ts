export interface BatchResponse {
  billing?: {
    billed?: boolean;
    charged?: boolean;
    cost_nanos?: number;
    cost_usd?: number;
    finalized_at?: string;
    pricing_breakdown?: {
      [key: string]: unknown;
    };
    reason?: string;
  };
  cancelled_at?: number;
  cancelling_at?: number;
  completed_at?: number;
  completion_window?: string;
  created_at?: number;
  endpoint?: string;
  error_file_id?: string;
  errors?: {};
  expired_at?: number;
  expires_at?: number;
  failed_at?: number;
  finalizing_at?: number;
  id?: string;
  in_progress_at?: number;
  input_file_id?: string;
  metadata?: {};
  object?: string;
  output_file_id?: string;
  pricing_lines?: {
    [key: string]: unknown;
  }[];
  provider?: string;
  request_counts?: {
    completed?: number;
    failed?: number;
    total?: number;
  };
  request_id?: string;
  session_id?: string;
  status?: string;
  webhook?: {
    events?: string[];
    secret?: string;
    url?: string;
  };
}
