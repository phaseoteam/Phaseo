export interface ImagesGenerationRequest {
  model: string;
  n?: number;
  prompt: string;
  provider?: {
    ignore?: string[];
    include_alpha?: boolean;
    only?: string[];
    order?: string[];
  };
  quality?: string;
  response_format?: string;
  size?: string;
  style?: string;
  user?: string;
}
