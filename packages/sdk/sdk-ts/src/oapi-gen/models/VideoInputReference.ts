export interface VideoInputReference {
  image_url?: {
    url: string;
  };
  reference_type?: string;
  role?: "first_frame" | "last_frame" | "reference" | "source" | "mask";
  type: "image_url";
}
