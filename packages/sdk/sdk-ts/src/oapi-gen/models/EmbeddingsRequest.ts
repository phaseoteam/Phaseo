export interface EmbeddingsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  dimensions?: number;
  embedding_options?: {
    google?: {
      output_dimensionality?: number;
      task_type?:
        | "TASK_TYPE_UNSPECIFIED"
        | "RETRIEVAL_QUERY"
        | "RETRIEVAL_DOCUMENT"
        | "SEMANTIC_SIMILARITY"
        | "CLASSIFICATION";
      title?: string;
    };
    mistral?: {
      output_dimension?: number | null;
      output_dtype?: "float" | "int8" | "uint8" | "binary" | "ubinary";
    };
  };
  encoding_format?: string;
  input?: string | string[];
  inputs?: string | string[];
  model?: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  user?: string;
}
