export interface DecisionInputMessage {
  content:
    | string
    | (
        | {
            text: string;
            type: "input_text";
          }
        | {
            detail?: "low" | "high" | "auto" | "original" | null;
            image_url: string;
            type: "input_image";
          }
      )[];
  role: "user";
  type?: "message";
}
