export interface ExtractionListAnswer {
  confidence: number;
  type: "list";
  value: (string | number)[];
}
