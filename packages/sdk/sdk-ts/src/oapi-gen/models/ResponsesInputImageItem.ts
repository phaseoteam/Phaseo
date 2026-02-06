export interface ResponsesInputImageItem {
  detail?: "auto" | "low" | "high";
  image_url:
    | string
    | {
        url?: string;
      };
  type: "input_image";
}
