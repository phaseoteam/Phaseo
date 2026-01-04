export interface ImagesGenerationRequest {
  model: string;
  n?: number;
  prompt: string;
  quality?: string;
  response_format?: string;
  size?: string;
  style?: string;
  user?: string;
}
