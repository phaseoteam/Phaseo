export interface ImagesGenerationRequest {
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
