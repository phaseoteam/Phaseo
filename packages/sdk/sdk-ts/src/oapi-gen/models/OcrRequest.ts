export interface OcrRequest {
  echo_upstream_request?: boolean;
  image: string;
  language?: string;
  model: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
}
