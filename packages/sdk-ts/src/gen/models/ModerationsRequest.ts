export interface ModerationsRequest {
  input:
    | string
    | {
        text: string;
        type: "text";
      }
    | {
        image_url: {
          url?: string;
        };
        type: "image_url";
      }[];
  meta?: boolean;
  model: string;
}
