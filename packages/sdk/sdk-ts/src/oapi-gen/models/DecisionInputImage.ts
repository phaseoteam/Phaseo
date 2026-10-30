/**
 * Inline base64 image, or an HTTPS image URL on Amazon S3, Google Cloud Storage or Azure Blob Storage (Base Labs models only). File IDs are unsupported. A request supports at most 128 images across all messages; individual providers can impose lower limits.
 */
export interface DecisionInputImage {
  detail?: "low" | "high" | "auto" | "original" | null;
  image_url: string;
  type: "input_image";
}
