export interface BatchRequest {
  completion_window?: string;
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  endpoint: string;
  input_file_id: string;
  metadata?: {};
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
}
