export interface InputImageContentPart {
  image_url:
    | string
    | {
        url?: string;
      };
  type: "input_image";
}
