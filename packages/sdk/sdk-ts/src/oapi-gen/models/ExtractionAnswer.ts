export type ExtractionAnswer =
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
