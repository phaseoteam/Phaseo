export interface ResponsesOutputImagePart {
  b64_json?: string;
  image_url?: {
    url?: string;
  };
  mime_type?: string;
  type: "output_image";
}
