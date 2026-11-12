export interface ExtractionStringAnswer {
  confidence: number;
  p_null: number;
  type: "text" | "date" | "time" | "datetime";
  value: string | null;
}
