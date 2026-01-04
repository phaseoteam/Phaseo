export interface ImagesEditResponse {
  created?: number;
  data?: {
    b64_json?: string;
    revised_prompt?: string;
    url?: string;
  }[];
}
