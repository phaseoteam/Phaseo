export interface VideoGenerationResponse {
  created?: number;
  id?: string;
  model?: string;
  object?: string;
  output?: {
    id?: string;
    type?: string;
    url?: string;
  }[];
  status?: string;
}
