export interface EmbeddingsRequest {
  dimensions?: number;
  encoding_format?: string;
  input: string | string[];
  model: string;
  user?: string;
}
