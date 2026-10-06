/**
 * Inline base64 image. Hosted URLs and file IDs are unsupported. A request supports at most 128 images across all messages; individual providers can impose lower limits.
 */
export interface DecisionInputImage {
  detail?: "low" | "high" | "auto" | "original" | null;
  image_url: string;
  type: "input_image";
}
