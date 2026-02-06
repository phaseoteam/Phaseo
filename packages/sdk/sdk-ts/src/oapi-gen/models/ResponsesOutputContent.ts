export interface ResponsesOutputContent {
  annotations?: {}[];
  b64_json?: string;
  image_url?: {
    url?: string;
  };
  mime_type?: string;
  text?: string;
  type?: "output_text" | "output_image";
  [key: string]: unknown;
}
