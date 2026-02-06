export interface ImagesGenerationRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  model: string;
  n?: number;
  prompt: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  quality?: string;
  response_format?: string;
  size?: string;
  style?: string;
  user?: string;
}
