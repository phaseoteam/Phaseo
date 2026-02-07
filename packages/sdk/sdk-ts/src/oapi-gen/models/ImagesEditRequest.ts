export interface ImagesEditRequest {
  image: string;
  mask?: string;
  meta?: boolean;
  model: string;
  n?: number;
  prompt: string;
  provider?: {
    ignore?: string[];
    only?: string[];
    order?: string[];
  };
  size?: string;
  usage?: boolean;
  user?: string;
}
