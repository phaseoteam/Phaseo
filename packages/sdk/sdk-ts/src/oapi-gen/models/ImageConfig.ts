export interface ImageConfig {
  aspect_ratio?: string;
  aspectRatio?: string;
  font_inputs?: {
    font_url?: string;
    text?: string;
  }[];
  fontInputs?: {
    fontUrl?: string;
    text?: string;
  }[];
  image_size?: "0.5K" | "1K" | "2K" | "4K";
  imageSize?: "0.5K" | "1K" | "2K" | "4K";
  include_rai_reason?: boolean;
  includeRaiReason?: boolean;
  reference_images?: {
    [key: string]: unknown;
  }[];
  referenceImages?: {
    [key: string]: unknown;
  }[];
  super_resolution_references?: string[];
  superResolutionReferences?: string[];
  [key: string]: unknown;
}
