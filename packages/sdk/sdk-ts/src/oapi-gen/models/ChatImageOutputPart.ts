export interface ChatImageOutputPart {
  image_url: {
    url: string;
  };
  mime_type?: string;
  type: "image_url";
}
