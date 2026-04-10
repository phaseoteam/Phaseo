export interface RerankRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  documents:
    | string[]
    | {
        [key: string]: unknown;
      }[];
  max_chunks_per_doc?: number;
  metadata?: {
    [key: string]: string;
  };
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  provider_options?: {
    [key: string]: unknown;
  };
  query: string;
  rank_fields?: string[];
  return_documents?: boolean;
  top_k?: number;
  top_n?: number;
  user?: string;
}
