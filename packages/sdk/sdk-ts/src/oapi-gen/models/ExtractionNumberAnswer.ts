export interface ExtractionNumberAnswer {
  confidence: number;
  p_null: number;
  type: "number" | "duration";
  value: number | null;
}
