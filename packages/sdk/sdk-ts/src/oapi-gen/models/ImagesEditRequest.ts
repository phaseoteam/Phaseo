export interface ImagesEditRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  image: string;
  mask?: string;
  meta?: boolean;
  model: string;
  n?: number;
  prompt: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  size?: string;
  usage?: boolean;
  user?: string;
}
