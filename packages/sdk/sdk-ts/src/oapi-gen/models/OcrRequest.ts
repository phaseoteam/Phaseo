export interface OcrRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  image: string;
  language?: string;
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
}
