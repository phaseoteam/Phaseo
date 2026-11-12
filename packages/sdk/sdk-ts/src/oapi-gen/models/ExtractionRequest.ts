export interface ExtractionRequest {
  fields: {
    [key: string]:
      | {
          instructions?: string;
          type: "text";
        }
      | {
          decimals?: number;
          instructions?: string;
          integer?: boolean;
          type: "number";
          unit?: string;
        }
      | {
          instructions?: string;
          type: "date";
        }
      | {
          instructions?: string;
          type: "time";
        }
      | {
          instructions?: string;
          type: "datetime";
        }
      | {
          decimals?: number;
          instructions?: string;
          integer?: boolean;
          type: "duration";
          unit?:
            | "seconds"
            | "minutes"
            | "hours"
            | "days"
            | "weeks"
            | "months"
            | "years";
        }
      | {
          decimals?: number;
          instructions?: string;
          items: "text" | "number" | "date";
          type: "list";
        };
  };
  images?: {
    base64: string;
    content_type: "image/png" | "image/jpeg" | "image/webp";
  }[];
  input: string;
  model: string;
  reference_date?: string;
}
