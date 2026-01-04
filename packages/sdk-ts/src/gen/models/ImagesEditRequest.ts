export interface ImagesEditRequest {
  image: string;
  mask?: string;
  meta?: boolean;
  model: string;
  n?: number;
  prompt: string;
  size?: string;
  usage?: boolean;
  user?: string;
}
