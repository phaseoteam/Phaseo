export interface OcrRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  echo_upstream_request?: boolean;
  image: string;
  language?: string;
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
}
