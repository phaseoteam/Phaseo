export interface ImageConfig {
  aspect_ratio?: string;
  font_inputs?: {
    font_url?: string;
    text?: string;
  }[];
  image_size?: "0.5K" | "1K" | "2K" | "4K";
  include_rai_reason?: boolean;
  reference_images?: {
    [key: string]: unknown;
  }[];
  super_resolution_references?: string[];
  [key: string]: unknown;
}
