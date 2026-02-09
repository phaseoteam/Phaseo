export interface ModerationsRequest {
  debug?: {
    enabled?: boolean;
    return_upstream_request?: boolean;
    return_upstream_response?: boolean;
    trace?: boolean;
    trace_level?: "summary" | "full";
  };
  input:
    | string
    | {
        text: string;
        type: "text";
      }
    | {
        image_url: {
          url?: string;
        };
        type: "image_url";
      }[];
  meta?: boolean;
  model: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
}
