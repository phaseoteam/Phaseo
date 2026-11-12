export interface ExtractionResponse {
  answers: {
    [key: string]:
      | {
          confidence: number;
          p_null: number;
          type: "text" | "date" | "time" | "datetime";
          value: string | null;
        }
      | {
          confidence: number;
          p_null: number;
          type: "number" | "duration";
          value: number | null;
        }
      | {
          confidence: number;
          type: "list";
          value: (string | number)[];
        };
  };
  model: string;
  truncated: boolean;
  usage: {
    input_tokens: number;
    output_tokens: 0;
    total_tokens: number;
  };
}
